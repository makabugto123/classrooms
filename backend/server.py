from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import os
import logging
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr


# -----------------------------------------------------------------------------
# Setup
# -----------------------------------------------------------------------------

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("classroom-app")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_ALGORITHM = "HS256"


def get_jwt_secret() -> str:
    return os.environ["JWT_SECRET"]


# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    name: str
    email: EmailStr
    role: Literal["admin", "teacher"]


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class ClassroomCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    building: str = Field(..., min_length=1, max_length=100)
    floor: str = Field(..., min_length=1, max_length=20)
    capacity: int = Field(..., ge=1, le=1000)
    equipment: List[str] = Field(default_factory=list)


class ClassroomUpdate(BaseModel):
    name: Optional[str] = None
    building: Optional[str] = None
    floor: Optional[str] = None
    capacity: Optional[int] = None
    equipment: Optional[List[str]] = None
    is_available: Optional[bool] = None
    unavailable_reason: Optional[str] = None


class ClassroomOut(BaseModel):
    id: str
    name: str
    building: str
    floor: str
    capacity: int
    equipment: List[str]
    is_available: bool = True
    unavailable_reason: Optional[str] = None
    created_at: datetime


class BookingCreate(BaseModel):
    classroom_id: str
    purpose: str = Field(..., min_length=1, max_length=200)
    start_time: datetime
    end_time: datetime


class BookingOut(BaseModel):
    id: str
    classroom_id: str
    classroom_name: str
    teacher_id: str
    teacher_name: str
    purpose: str
    start_time: datetime
    end_time: datetime
    created_at: datetime


class ClassroomWithStatus(BaseModel):
    id: str
    name: str
    building: str
    floor: str
    capacity: int
    equipment: List[str]
    is_available: bool = True
    unavailable_reason: Optional[str] = None
    status: Literal["vacant", "occupied", "unavailable"]
    current_booking: Optional[BookingOut] = None
    next_booking_today: Optional[BookingOut] = None


# -----------------------------------------------------------------------------
# Auth helpers
# -----------------------------------------------------------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


def serialize_user(doc: dict) -> UserOut:
    return UserOut(id=doc["id"], name=doc["name"], email=doc["email"], role=doc["role"])


async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# -----------------------------------------------------------------------------
# App / Router
# -----------------------------------------------------------------------------

app = FastAPI(title="Classroom Management API")
api = APIRouter(prefix="/api")


@api.get("/")
async def root():
    return {"message": "Classroom Management API", "status": "ok"}


# ----- Auth endpoints --------------------------------------------------------

@api.post("/auth/register", response_model=AuthResponse)
async def register(payload: RegisterRequest):
    email = payload.email.lower().strip()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": payload.name.strip(),
        "email": email,
        "password_hash": hash_password(payload.password),
        "role": "teacher",  # public registration is for teachers only
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user_doc)
    token = create_access_token(user_id, email, "teacher")
    return AuthResponse(token=token, user=serialize_user(user_doc))


@api.post("/auth/login", response_model=AuthResponse)
async def login(payload: LoginRequest):
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], user["email"], user["role"])
    return AuthResponse(token=token, user=serialize_user(user))


@api.get("/auth/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return serialize_user(user)


# ----- Classroom endpoints ---------------------------------------------------

def _classroom_out(doc: dict) -> ClassroomOut:
    return ClassroomOut(
        id=doc["id"],
        name=doc["name"],
        building=doc["building"],
        floor=doc["floor"],
        capacity=doc["capacity"],
        equipment=doc.get("equipment", []),
        is_available=doc.get("is_available", True),
        unavailable_reason=doc.get("unavailable_reason"),
        created_at=doc["created_at"],
    )


@api.post("/classrooms", response_model=ClassroomOut)
async def create_classroom(payload: ClassroomCreate, _: dict = Depends(require_admin)):
    doc = {
        "id": str(uuid.uuid4()),
        "name": payload.name.strip(),
        "building": payload.building.strip(),
        "floor": payload.floor.strip(),
        "capacity": payload.capacity,
        "equipment": [e.strip() for e in payload.equipment if e and e.strip()],
        "is_available": True,
        "unavailable_reason": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.classrooms.insert_one(doc)
    return _classroom_out(doc)


async def _build_status(c: dict) -> ClassroomWithStatus:
    """Compute live status for a classroom. Unavailable wins; otherwise
    occupied iff there is any booking that's active now or scheduled later today."""
    now = datetime.now(timezone.utc)
    end_of_today = now.replace(hour=23, minute=59, second=59, microsecond=999999)

    is_available = c.get("is_available", True)

    current = await db.bookings.find_one(
        {
            "classroom_id": c["id"],
            "start_time": {"$lte": now},
            "end_time": {"$gte": now},
        },
        {"_id": 0},
    )
    next_today = None
    if not current:
        next_today = await db.bookings.find_one(
            {
                "classroom_id": c["id"],
                "start_time": {"$gt": now, "$lte": end_of_today},
            },
            {"_id": 0},
            sort=[("start_time", 1)],
        )

    if not is_available:
        status = "unavailable"
    elif current or next_today:
        status = "occupied"
    else:
        status = "vacant"

    return ClassroomWithStatus(
        id=c["id"],
        name=c["name"],
        building=c["building"],
        floor=c["floor"],
        capacity=c["capacity"],
        equipment=c.get("equipment", []),
        is_available=is_available,
        unavailable_reason=c.get("unavailable_reason"),
        status=status,
        current_booking=BookingOut(**current) if current else None,
        next_booking_today=BookingOut(**next_today) if next_today else None,
    )


@api.get("/classrooms", response_model=List[ClassroomWithStatus])
async def list_classrooms(user: dict = Depends(get_current_user)):
    classrooms = await db.classrooms.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [await _build_status(c) for c in classrooms]


@api.get("/classrooms/{classroom_id}", response_model=ClassroomWithStatus)
async def get_classroom(classroom_id: str, user: dict = Depends(get_current_user)):
    c = await db.classrooms.find_one({"id": classroom_id}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Classroom not found")
    return await _build_status(c)


@api.patch("/classrooms/{classroom_id}", response_model=ClassroomOut)
async def update_classroom(classroom_id: str, payload: ClassroomUpdate, _: dict = Depends(require_admin)):
    # Use exclude_unset so explicit `null` values (e.g., clearing unavailable_reason) are honored.
    updates = payload.dict(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.classrooms.update_one({"id": classroom_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Classroom not found")
    doc = await db.classrooms.find_one({"id": classroom_id}, {"_id": 0})
    return _classroom_out(doc)


@api.delete("/classrooms/{classroom_id}")
async def delete_classroom(classroom_id: str, _: dict = Depends(require_admin)):
    result = await db.classrooms.delete_one({"id": classroom_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Classroom not found")
    await db.bookings.delete_many({"classroom_id": classroom_id})
    return {"success": True}


# ----- Booking endpoints -----------------------------------------------------

@api.post("/bookings", response_model=BookingOut)
async def create_booking(payload: BookingCreate, user: dict = Depends(get_current_user)):
    # Normalize times to UTC
    start = payload.start_time
    end = payload.end_time
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    if end <= start:
        raise HTTPException(status_code=400, detail="End time must be after start time")
    if start < datetime.now(timezone.utc) - timedelta(minutes=1):
        raise HTTPException(status_code=400, detail="Start time cannot be in the past")

    classroom = await db.classrooms.find_one({"id": payload.classroom_id}, {"_id": 0})
    if not classroom:
        raise HTTPException(status_code=404, detail="Classroom not found")
    if not classroom.get("is_available", True):
        reason = classroom.get("unavailable_reason") or "currently unavailable"
        raise HTTPException(status_code=400, detail=f"Classroom is {reason}")
    conflict = await db.bookings.find_one(
        {
            "classroom_id": payload.classroom_id,
            "start_time": {"$lt": end},
            "end_time": {"$gt": start},
        },
        {"_id": 0},
    )
    if conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Time slot conflicts with existing booking by {conflict['teacher_name']}",
        )

    doc = {
        "id": str(uuid.uuid4()),
        "classroom_id": payload.classroom_id,
        "classroom_name": classroom["name"],
        "teacher_id": user["id"],
        "teacher_name": user["name"],
        "purpose": payload.purpose.strip(),
        "start_time": start,
        "end_time": end,
        "created_at": datetime.now(timezone.utc),
    }
    await db.bookings.insert_one(doc)
    return BookingOut(**doc)


@api.get("/bookings", response_model=List[BookingOut])
async def list_bookings(
    classroom_id: Optional[str] = None,
    mine: bool = False,
    upcoming: bool = False,
    user: dict = Depends(get_current_user),
):
    query: dict = {}
    # Teachers only see their own unless explicitly listing classroom or admin
    if user["role"] != "admin" and not classroom_id:
        query["teacher_id"] = user["id"]
    if mine:
        query["teacher_id"] = user["id"]
    if classroom_id:
        query["classroom_id"] = classroom_id
    if upcoming:
        query["end_time"] = {"$gte": datetime.now(timezone.utc)}

    docs = await db.bookings.find(query, {"_id": 0}).sort("start_time", 1).to_list(1000)
    return [BookingOut(**d) for d in docs]


@api.delete("/bookings/{booking_id}")
async def cancel_booking(booking_id: str, user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if user["role"] != "admin" and booking["teacher_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Cannot cancel another teacher's booking")
    await db.bookings.delete_one({"id": booking_id})
    return {"success": True}


# -----------------------------------------------------------------------------
# Startup: indexes + admin seed
# -----------------------------------------------------------------------------

async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@school.com").lower().strip()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one(
            {
                "id": str(uuid.uuid4()),
                "name": "Administrator",
                "email": admin_email,
                "password_hash": hash_password(admin_password),
                "role": "admin",
                "created_at": datetime.now(timezone.utc),
            }
        )
        logger.info(f"Seeded admin user: {admin_email}")
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one(
            {"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}}
        )
        logger.info(f"Updated admin password for: {admin_email}")


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.classrooms.create_index("id", unique=True)
    await db.bookings.create_index("id", unique=True)
    await db.bookings.create_index([("classroom_id", 1), ("start_time", 1)])
    await seed_admin()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
