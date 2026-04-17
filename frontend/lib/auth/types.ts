export interface User {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LoginResponse {
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
  fullName?: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface AuthError {
  code: string;
  message: string;
}
