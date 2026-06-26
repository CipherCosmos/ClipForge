import logging

import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.plans import FREE_LIMITS, PRO_LIMITS
from app.core.security import get_current_user
from app.database import get_db
from app.models.subscription import Subscription
from app.models.user import User
from app.services import billing as billing_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/billing", tags=["billing"])


class CheckoutRequest(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    url: str


class PortalResponse(BaseModel):
    url: str


class PlanInfo(BaseModel):
    id: str
    name: str
    price: int
    price_display: str
    features: list[str]


class PlansResponse(BaseModel):
    free: PlanInfo
    pro_monthly: PlanInfo
    pro_yearly: PlanInfo


class SubscriptionStatus(BaseModel):
    active: bool
    plan: str
    status: str
    current_period_end: str | None
    cancel_at_period_end: bool


@router.get("/plans", response_model=PlansResponse)
async def get_plans():
    if not billing_service.is_stripe_configured():
        raise HTTPException(status_code=501, detail="Billing is not configured")

    return PlansResponse(
        free=PlanInfo(
            id="free",
            name="Free",
            price=0,
            price_display="$0",
            features=[
                f"{FREE_LIMITS['max_videos']} videos",
                f"Up to {FREE_LIMITS['max_resolution']}",
                "Watermark (ClipForge)",
                f"{FREE_LIMITS['max_exports_per_day']} exports/day",
            ],
        ),
        pro_monthly=PlanInfo(
            id=settings.STRIPE_PRO_PRICE_ID,
            name="Pro Monthly",
            price=settings.STRIPE_PRO_MONTHLY_PRICE,
            price_display=f"${settings.STRIPE_PRO_MONTHLY_PRICE // 100}.{settings.STRIPE_PRO_MONTHLY_PRICE % 100:02d}/mo",
            features=[
                f"{PRO_LIMITS['max_videos']} videos",
                f"Up to {PRO_LIMITS['max_resolution']}",
                "No watermark",
                "Priority processing",
            ],
        ),
        pro_yearly=PlanInfo(
            id="price_yearly_pro",
            name="Pro Yearly",
            price=settings.STRIPE_PRO_YEARLY_PRICE,
            price_display=f"${settings.STRIPE_PRO_YEARLY_PRICE // 100}.{settings.STRIPE_PRO_YEARLY_PRICE % 100:02d}/yr",
            features=[
                f"{PRO_LIMITS['max_videos']} videos",
                f"Up to {PRO_LIMITS['max_resolution']}",
                "No watermark",
                "Priority processing",
                "2 months free",
            ],
        ),
    )


@router.post("/create-checkout-session", response_model=CheckoutResponse)
async def create_checkout_session(
    payload: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not billing_service.is_stripe_configured():
        raise HTTPException(status_code=501, detail="Billing is not configured")

    try:
        url = await billing_service.create_checkout_session(
            user=current_user,
            price_id=payload.price_id,
            success_url=payload.success_url,
            cancel_url=payload.cancel_url,
            db=db,
        )
        return CheckoutResponse(url=url)
    except Exception as e:
        logger.error("Failed to create checkout session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create checkout session")


@router.post("/create-portal-session", response_model=PortalResponse)
async def create_portal_session(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not billing_service.is_stripe_configured():
        raise HTTPException(status_code=501, detail="Billing is not configured")

    try:
        url = await billing_service.create_portal_session(user=current_user, db=db)
        return PortalResponse(url=url)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Failed to create portal session: %s", e)
        raise HTTPException(status_code=500, detail="Failed to create portal session")


@router.post("/webhook")
async def stripe_webhook(request: Request):
    if not billing_service.is_stripe_configured():
        raise HTTPException(status_code=501, detail="Billing is not configured")

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if not sig_header:
        raise HTTPException(status_code=400, detail="Missing stripe-signature header")

    try:
        await billing_service.handle_webhook_event(payload, sig_header)
        return {"received": True}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        logger.error("Webhook error: %s", e)
        raise HTTPException(status_code=500, detail="Webhook processing failed")


@router.get("/subscription", response_model=SubscriptionStatus)
async def get_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Subscription).where(Subscription.user_id == current_user.id)
    )
    sub = result.scalar_one_or_none()

    if not sub or sub.status in ("canceled", "incomplete_expired"):
        return SubscriptionStatus(
            active=False,
            plan="free",
            status="none",
            current_period_end=None,
            cancel_at_period_end=False,
        )

    return SubscriptionStatus(
        active=sub.status == "active" or sub.status == "trialing",
        plan=sub.plan,
        status=sub.status,
        current_period_end=(
            sub.current_period_end.isoformat() if sub.current_period_end else None
        ),
        cancel_at_period_end=sub.cancel_at_period_end,
    )


@router.post("/cancel")
async def cancel_subscription(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not billing_service.is_stripe_configured():
        raise HTTPException(status_code=501, detail="Billing is not configured")

    result = await db.execute(
        select(Subscription).where(Subscription.user_id == current_user.id)
    )
    sub = result.scalar_one_or_none()
    if not sub or sub.status not in ("active", "trialing", "past_due"):
        raise HTTPException(status_code=404, detail="No active subscription found")

    success = await billing_service.cancel_subscription(user=current_user, db=db)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to cancel subscription")

    return {"message": "Subscription will be canceled at the end of the billing period"}
