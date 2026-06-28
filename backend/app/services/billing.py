import logging
from typing import Optional

import stripe
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.subscription import Subscription
from app.models.user import User

logger = logging.getLogger(__name__)


def is_stripe_configured() -> bool:
    return bool(settings.STRIPE_SECRET_KEY)


def _ensure_stripe():
    if not is_stripe_configured():
        raise RuntimeError("Stripe is not configured")
    stripe.api_key = settings.STRIPE_SECRET_KEY


async def create_checkout_session(
    user: User,
    price_id: str,
    success_url: str,
    cancel_url: str,
    db: AsyncSession,
) -> str:
    _ensure_stripe()

    # Find or create Stripe customer
    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    existing = result.scalar_one_or_none()
    customer_id = existing.stripe_customer_id if existing else None

    session = stripe.checkout.Session.create(
        customer=customer_id,
        customer_email=customer_id is None and user.email or None,
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={"user_id": str(user.id)},
    )

    return session.url


async def create_portal_session(user: User, db: AsyncSession) -> str:
    _ensure_stripe()

    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    sub = result.scalar_one_or_none()
    if not sub:
        raise ValueError("No subscription found")

    session = stripe.billing_portal.Session.create(
        customer=sub.stripe_customer_id,
        return_url=settings.FRONTEND_URL + "/app/billing",
    )

    return session.url


async def handle_webhook_event(payload: bytes, sig_header: str) -> None:
    _ensure_stripe()

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except ValueError:
        logger.error("Invalid Stripe webhook payload")
        raise
    except stripe.SignatureVerificationError:
        logger.error("Invalid Stripe webhook signature")
        raise

    event_type = event["type"]
    logger.info("Stripe webhook event: %s", event_type)

    from app.database import async_session

    async with async_session() as db:
        if event_type == "checkout.session.completed":
            await _handle_checkout_completed(event["data"]["object"], db)
        elif event_type == "customer.subscription.updated":
            await _handle_subscription_updated(event["data"]["object"], db)
        elif event_type == "customer.subscription.deleted":
            await _handle_subscription_deleted(event["data"]["object"], db)
        elif event_type == "invoice.payment_failed":
            await _handle_invoice_payment_failed(event["data"]["object"], db)
        else:
            logger.info("Unhandled Stripe event: %s", event_type)

        await db.commit()


async def _get_user_by_stripe_customer(stripe_customer_id: str, db: AsyncSession) -> Optional[User]:
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_customer_id == stripe_customer_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        result = await db.execute(select(User).where(User.id == sub.user_id))
        return result.scalar_one_or_none()
    return None


async def _get_sub_and_user(
    subscription_id: str, db: AsyncSession
) -> tuple[Subscription | None, User | None]:
    """Fetch subscription by Stripe ID and its owning user."""
    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == subscription_id)
    )
    sub = result.scalar_one_or_none()
    if not sub:
        return None, None
    result = await db.execute(select(User).where(User.id == sub.user_id))
    return sub, result.scalar_one_or_none()


async def _handle_checkout_completed(session_data: dict, db: AsyncSession) -> None:
    customer_id = session_data.get("customer")
    user_id_str = session_data.get("metadata", {}).get("user_id")
    subscription_id = session_data.get("subscription")

    if not subscription_id:
        return

    # Fetch full subscription details from Stripe
    stripe_sub = stripe.Subscription.retrieve(subscription_id)
    plan = stripe_sub["items"]["data"][0]["price"]["id"]
    plan_name = "pro_yearly" if "year" in str(plan) else "pro_monthly"

    if user_id_str:
        from uuid import UUID

        user_id = UUID(user_id_str)
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user:
            user.plan = "pro"
            # Upsert subscription
            result = await db.execute(select(Subscription).where(Subscription.user_id == user_id))
            sub = result.scalar_one_or_none()
            if sub:
                sub.stripe_subscription_id = subscription_id
                sub.stripe_customer_id = customer_id
                sub.status = stripe_sub["status"]
                sub.plan = plan_name
                sub.current_period_start = _ts_to_dt(stripe_sub["current_period_start"])
                sub.current_period_end = _ts_to_dt(stripe_sub["current_period_end"])
                sub.cancel_at_period_end = stripe_sub["cancel_at_period_end"]
            else:
                sub = Subscription(
                    user_id=user_id,
                    stripe_subscription_id=subscription_id,
                    stripe_customer_id=customer_id,
                    status=stripe_sub["status"],
                    plan=plan_name,
                    current_period_start=_ts_to_dt(stripe_sub["current_period_start"]),
                    current_period_end=_ts_to_dt(stripe_sub["current_period_end"]),
                    cancel_at_period_end=stripe_sub["cancel_at_period_end"],
                )
                db.add(sub)
            logger.info("Subscription created for user %s", user_id)


async def _handle_subscription_updated(stripe_sub: dict, db: AsyncSession) -> None:
    subscription_id = stripe_sub["id"]
    sub, user = await _get_sub_and_user(subscription_id, db)
    if not sub:
        return

    sub.status = stripe_sub["status"]
    sub.current_period_start = _ts_to_dt(stripe_sub["current_period_start"])
    sub.current_period_end = _ts_to_dt(stripe_sub["current_period_end"])
    sub.cancel_at_period_end = stripe_sub["cancel_at_period_end"]

    if user:
        user.plan = "pro" if stripe_sub["status"] == "active" else "free"

    logger.info("Subscription updated: %s", subscription_id)


async def _handle_subscription_deleted(stripe_sub: dict, db: AsyncSession) -> None:
    subscription_id = stripe_sub["id"]
    sub, user = await _get_sub_and_user(subscription_id, db)
    if not sub:
        return

    sub.status = "canceled"
    if user:
        user.plan = "free"

    logger.info("Subscription deleted: %s", subscription_id)


async def _handle_invoice_payment_failed(invoice: dict, db: AsyncSession) -> None:
    subscription_id = invoice.get("subscription")
    if not subscription_id:
        return

    result = await db.execute(
        select(Subscription).where(Subscription.stripe_subscription_id == subscription_id)
    )
    sub = result.scalar_one_or_none()
    if sub:
        sub.status = "past_due"
        logger.warning("Payment failed for subscription %s", subscription_id)


def _ts_to_dt(ts: Optional[int]):
    from datetime import datetime, timezone

    if ts:
        return datetime.fromtimestamp(ts, tz=timezone.utc)
    return None


async def cancel_subscription(user: User, db: AsyncSession) -> bool:
    _ensure_stripe()

    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    sub = result.scalar_one_or_none()
    if not sub or sub.status not in ("active", "trialing", "past_due"):
        return False

    stripe.Subscription.modify(
        sub.stripe_subscription_id,
        cancel_at_period_end=True,
    )

    sub.cancel_at_period_end = True
    await db.commit()
    return True
