from fastapi import FastAPI
from app.auth.auth import router as routerAuth
from app.campus.campus import router as routerCampus

app = FastAPI()

app.include_router(routerAuth)
app.include_router(routerCampus)

@app.get("/")
async def root():
    return {"message": "OK"}

@app.get("/health")
async def health():
    return {"status": "OK"}
