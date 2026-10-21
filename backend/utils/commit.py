from typing import TypeVar
from sqlalchemy.orm import Session

T = TypeVar('T')


def commit_db(data: T, db: Session) -> T:
    db.add(data)
    db.commit()
    db.refresh(data)
    return data