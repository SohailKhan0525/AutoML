from sqlalchemy import Column, String, DateTime, create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./automl.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    auth_provider = Column(String, nullable=True)
    auth_subject = Column(String, nullable=True, index=True)
    display_name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    plan = Column(String, nullable=False, default="free")
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "name": self.display_name or self.email.split("@")[0],
            "avatar_url": self.avatar_url,
            "auth_provider": self.auth_provider,
            "plan": self.plan or "free",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# Create tables
Base.metadata.create_all(bind=engine)


def _ensure_users_table_columns() -> None:
    """Best-effort migration for new auth columns on existing SQLite installs."""
    required_columns = {
        "auth_provider": "ALTER TABLE users ADD COLUMN auth_provider VARCHAR",
        "auth_subject": "ALTER TABLE users ADD COLUMN auth_subject VARCHAR",
        "display_name": "ALTER TABLE users ADD COLUMN display_name VARCHAR",
        "avatar_url": "ALTER TABLE users ADD COLUMN avatar_url VARCHAR",
        "plan": "ALTER TABLE users ADD COLUMN plan VARCHAR DEFAULT 'free'",
    }

    try:
        with engine.begin() as conn:
            if "sqlite" in DATABASE_URL:
                existing = conn.execute(text("PRAGMA table_info(users)")).fetchall()
                existing_names = {row[1] for row in existing}
            else:
                rows = conn.execute(
                    text(
                        "SELECT column_name FROM information_schema.columns "
                        "WHERE table_name = 'users'"
                    )
                ).fetchall()
                existing_names = {row[0] for row in rows}

            for col_name, ddl in required_columns.items():
                if col_name not in existing_names:
                    conn.execute(text(ddl))
    except Exception:
        # Non-blocking migration for dev environments.
        pass


_ensure_users_table_columns()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
