import uuid

from app.models import Clip, Job, JobStatusEnum, JobTypeEnum, PlanEnum, User, Video, VideoStatusEnum


def test_user_enum():
    assert PlanEnum.FREE.value == "free"
    assert PlanEnum.PRO.value == "pro"


def test_user_defaults():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine("sqlite:///:memory:")
    User.__table__.create(bind=engine)
    test_session = sessionmaker(bind=engine)
    db = test_session()
    user = User(email="test@test.com", password_hash="hash")
    db.add(user)
    db.commit()
    assert user.plan == PlanEnum.FREE
    assert str(user.id) != ""
    db.close()


def test_clip_creation():
    clip = Clip(
        id=uuid.uuid4(),
        video_id=uuid.uuid4(),
        start_time=10.0,
        end_time=20.0,
        caption="Test caption",
        score=0.95,
        file_url="https://example.com/clip.mp4",
        thumbnail_url="https://example.com/thumb.jpg",
        title="Best Clip Ever",
        hashtags="viral,shorts",
    )
    assert clip.start_time == 10.0
    assert clip.end_time == 20.0
    assert clip.caption == "Test caption"
    assert clip.score == 0.95
    assert clip.file_url == "https://example.com/clip.mp4"
    assert clip.thumbnail_url == "https://example.com/thumb.jpg"
    assert clip.title == "Best Clip Ever"
    assert clip.hashtags == "viral,shorts"


def test_job_creation():
    for job_type in JobTypeEnum:
        for job_status in JobStatusEnum:
            job = Job(
                id=uuid.uuid4(),
                video_id=uuid.uuid4(),
                type=job_type,
                status=job_status,
                progress=0.5,
            )
            assert job.type == job_type
            assert job.status == job_status
            assert job.progress == 0.5


def test_user_api_key_hash():
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker

    engine = create_engine("sqlite:///:memory:")
    User.__table__.create(bind=engine)
    test_session = sessionmaker(bind=engine)
    db = test_session()
    user = User(
        email="apikey@test.com",
        password_hash="hash",
        plan=PlanEnum.FREE,
        api_key_hash="abc123",
    )
    db.add(user)
    db.commit()
    fetched = db.query(User).filter(User.email == "apikey@test.com").first()
    assert fetched.api_key_hash == "abc123"
    db.close()


def test_video_creation():
    video = Video(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_url="https://example.com/video.mp4",
        status=VideoStatusEnum.UPLOADED,
        duration=120.0,
        title="Test Video",
        transcript=[{"text": "hello world", "start": 0.0, "end": 5.0}],
        segments=[{"start": 0.0, "end": 5.0, "text": "hello world"}],
        language="en",
    )
    assert video.source_url == "https://example.com/video.mp4"
    assert video.status == VideoStatusEnum.UPLOADED
    assert video.duration == 120.0
    assert video.title == "Test Video"
    assert video.transcript == [{"text": "hello world", "start": 0.0, "end": 5.0}]
    assert video.segments == [{"start": 0.0, "end": 5.0, "text": "hello world"}]
    assert video.language == "en"
