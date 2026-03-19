import type { RegisterRequest, ValidationError } from "./types";

function createValidationError(validationErrors: ValidationError[]): Error {
  const error = new Error(validationErrors[0].message) as Error & {
    validationErrors: ValidationError[];
  };
  error.validationErrors = validationErrors;
  return error;
}

export function validateLoginInput(email: string, password: string): void {
  const validationErrors: ValidationError[] = [];

  if (!email) {
    validationErrors.push({ field: "email", message: "邮箱不能为空" });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    validationErrors.push({ field: "email", message: "邮箱格式不正确" });
  }

  if (!password) {
    validationErrors.push({ field: "password", message: "密码不能为空" });
  } else if (password.length < 8) {
    validationErrors.push({ field: "password", message: "密码长度至少8位" });
  }

  if (validationErrors.length > 0) {
    throw createValidationError(validationErrors);
  }
}

export function validateRegisterInput(data: RegisterRequest): void {
  const validationErrors: ValidationError[] = [];

  if (!data.email) {
    validationErrors.push({ field: "email", message: "邮箱不能为空" });
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    validationErrors.push({ field: "email", message: "邮箱格式不正确" });
  }

  if (!data.password) {
    validationErrors.push({ field: "password", message: "密码不能为空" });
  } else if (data.password.length < 8) {
    validationErrors.push({ field: "password", message: "密码长度至少8位" });
  }

  if (!data.username) {
    validationErrors.push({ field: "username", message: "用户名不能为空" });
  } else if (data.username.length < 3) {
    validationErrors.push({ field: "username", message: "用户名至少3个字符" });
  } else if (data.username.length > 50) {
    validationErrors.push({ field: "username", message: "用户名不能超过50个字符" });
  } else if (!/^[a-zA-Z0-9_-]+$/.test(data.username)) {
    validationErrors.push({
      field: "username",
      message: "用户名只包含字母、数字、下划线和连字符",
    });
  }

  if (validationErrors.length > 0) {
    throw createValidationError(validationErrors);
  }
}
