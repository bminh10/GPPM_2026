from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from requests import Session
from db.database import User
from utils.commit import commit_db

from db.database import get_db


router = APIRouter(prefix="/user", tags=["User"])


class UserRegister(BaseModel):
    user_name: str
    pass_word: str
    email: str
    role_id: int

class UserLogin(BaseModel):
    email: str
    pass_word: str

class UserResponse(BaseModel): 
    id: int
    user_name: str
    model_config = {"from_attributes": True}

# /user/register
@router.post("/register", response_model=UserResponse)
def register(user_data: UserRegister, db: Session = Depends(get_db)):

    get_user = db.query(User).where(User.user_name == user_data.user_name).first()
    if get_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tài khoản đã tồn tại!"
        )

    new_user = User(
        user_name=user_data.user_name,
        pass_word=user_data.pass_word,
        email=user_data.email,
        role_id=user_data.role_id
    )
    return commit_db(new_user, db)

@router.post("/login")
async def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).where(User.email == data.email).first()
    if not user:
        return {"message" : "Tai khoan khong ton tai!"}
    if user.pass_word != data.pass_word:
        return {"message" : "Sai mat khau!"}
    return {"message" : "Dang nhap thanh cong!"}

@router.get("/all", response_model=list[UserResponse])
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(User).all()
    return users

@router.patch("/{id}", response_model=UserResponse)
async def refactor_user(
    id: int, data: UserLogin, db: Session = Depends(get_db)
):
    # 1. Fetch existing user
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tài khoản không tồn tại!",
        )

    # 2. Apply patch logic on incoming fields
    if user.email != data.email:
        data.pass_word = user.pass_word
    if user.pass_word != data.pass_word:
        data.email = user.email

    # 3. Update fields on the existing ORM object directly
    user.pass_word = data.pass_word
    user.email = data.email

    # 4. Commit updates (SQL: UPDATE "user" SET ...)
    db.commit()
    db.refresh(user)

    return user

@router.delete("/{id}")
async def delete_user_by_id(id: int, db: Session = Depends(get_db)):
    user = db.query(User).where(User.id == id).first()

    if not user:
        return  {"message":"Khong tim thay user!"}

    db.delete(user)
    db.commit()
    return  {"message":"Da xoa thanh cong!"}