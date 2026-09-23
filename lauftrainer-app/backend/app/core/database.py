from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI-Dependency: eine DB-Session pro Request, wird danach
    zuverlaessig wieder geschlossen."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
