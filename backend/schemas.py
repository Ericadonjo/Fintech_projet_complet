from pydantic import BaseModel
from typing import Optional, List

class AccountBase(BaseModel):
    name: str
    type: str
    initial_balance: float
    currency: Optional[str] = "XAF"

class AccountCreate(AccountBase):
    pass

class AccountResponse(AccountBase):
    id: str
    class Config:
        from_attributes = True

class CategoryBase(BaseModel):
    name: str
    group_name: Optional[str] = "charge"
    icon: Optional[str] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: int
    class Config:
        from_attributes = True

class TransactionBase(BaseModel):
    account_id: str
    category_id: int
    type: str
    amount: float
    date: str
    description: Optional[str] = None
    reference: Optional[str] = None

class TransactionCreate(TransactionBase):
    currency: Optional[str] = "XAF"

class TransactionResponse(TransactionBase):
    id: str
    hash: Optional[str] = None
    class Config:
        from_attributes = True
