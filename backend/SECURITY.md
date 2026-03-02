# Security Policy

## Overview

This document outlines the security measures and practices implemented in the Spectra Backend project.

## Security Status

**Last Security Audit:** 2026-02-21 
**Current Status:** SECURE (0 known vulnerabilities)

## Dependency Security

All dependencies are regularly monitored and updated to their latest secure versions.

### Current Versions (as of 2026-02-21)

| Package | Version | Status |
|---------|---------|--------|
| fastapi | 0.129.0 | Secure |
| litellm | 1.81.13 | Secure |
| python-multipart | 0.0.22 | Secure |
| pydantic | 2.12.5 | Secure |
| prisma | 0.15.0 | Secure |
| uvicorn | 0.32.1 | Secure |
| black | 26.1.0 | Secure |

### Recent Security Fixes

**2026-02-21 - Security Update**
- Updated all dependencies to latest secure versions
- Fixed 11 known vulnerabilities across 4 packages
- Black: Fixed ReDoS vulnerability (CVE-2024-48)
- Pip: Updated to 26.0+ (CVE-2025-8869, CVE-2026-1703)
- Setuptools: Fixed path traversal and RCE vulnerabilities
- Starlette: Fixed DoS vulnerabilities (CVE-2024-47874, CVE-2025-54121)

**2026-02-15 - Critical Security Update**
- Fixed 14 vulnerabilities across 3 dependencies
- FastAPI: Fixed Content-Type Header ReDoS (CVE)
- LiteLLM: Fixed 10 critical vulnerabilities including RCE, SSRF, and API key leakage
- python-multipart: Fixed arbitrary file write and DoS vulnerabilities

## Security Measures Implemented

### 1. Input Validation
- All inputs validated using Pydantic v2 models
- Type checking enforced at runtime
- Request size limits enforced

### 2. Error Handling
- Generic error messages to prevent information leakage
- Detailed errors logged internally for debugging
- No stack traces exposed to clients

### 3. CORS Configuration
- Credentials disabled for wildcard origins
- Configurable allowed origins
- Secure defaults for production

### 4. File Upload Security
- UUID-based unique file naming to prevent collisions
- File size validation
- Upload directory isolated from application code

### 5. API Key Management
- API keys stored in environment variables
- .env files excluded from version control
- Example configuration provided in .env.example

### 6. Logging
- Comprehensive logging for security events
- Sensitive data excluded from logs
- Centralized logging configuration

### 7. Database Security
- Prisma ORM prevents SQL injection
- Parameterized queries throughout
- Database connection pooling

### 8. Async/Await
- Proper async implementation prevents event loop blocking
- Non-blocking I/O throughout
- Protection against DoS via resource exhaustion

## Security Best Practices

### For Development
1. Never commit `.env` files or API keys
2. Keep dependencies updated regularly
3. Run security scans before each release
4. Review code for security issues
5. Use environment-specific configurations

### For Production
1. Use HTTPS/TLS for all connections
2. Configure specific CORS origins
3. Use PostgreSQL instead of SQLite
4. Enable rate limiting
5. Implement request size limits
6. Use strong database passwords
7. Regular security audits
8. Monitor logs for suspicious activity
9. Keep all dependencies updated
10. Use environment variables for all secrets

## Reporting Security Vulnerabilities

If you discover a security vulnerability, please report it by:
1. Opening a private security advisory on GitHub
2. Including detailed information about the vulnerability
3. Providing steps to reproduce if possible

**Do not** create public issues for security vulnerabilities.

## Security Scanning

This project uses:
- CodeQL for static code analysis
- GitHub Advisory Database for dependency scanning
- Regular code reviews
- Automated security testing

## Compliance

This project follows:
- OWASP Top 10 security guidelines
- FastAPI security best practices
- Python security coding standards
- Secure development lifecycle principles

## Contact

For security-related questions, please contact the repository maintainers.

## Changelog

### 2026-02-21
- Updated all dependencies to latest secure versions
- Fixed 11 known vulnerabilities
- Zero known vulnerabilities

### 2026-02-15
- Updated all dependencies to patched versions
- Fixed 14 known vulnerabilities
- Implemented comprehensive security measures
- Zero known vulnerabilities

---

*This security policy is reviewed and updated regularly.*
