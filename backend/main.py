from fastapi import FastAPI
from app.auth.auth import router as routerAuth
from app.campus.campus import router as routerCampus
from app.classes.classes import router as routerClasses
from app.majors.majors import router as routerMajors
from app.rooms.rooms import router as routerRooms
from app.subjects.subjects import router as routerSubjects

app = FastAPI()

app.include_router(routerAuth)
app.include_router(routerCampus)
app.include_router(routerMajors)
app.include_router(routerClasses)
app.include_router(routerRooms)
app.include_router(routerSubjects)

@app.get("/")
async def root():
    return {"message": "OK"}

@app.get("/health")
async def health():
    return {"status": "OK"}
