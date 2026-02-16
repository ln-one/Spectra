# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

1. **Do NOT create a public GitHub issue** for security vulnerabilities
2. Use GitHub's [Private Security Advisory](https://github.com/ln-one/Spectra/security/advisories/new) feature
3. Or email the maintainers directly

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Affected versions
- Potential impact
- Suggested fix (if any)

### Response Timeline

| Action | Timeframe |
| ------ | --------- |
| Initial response | 48 hours |
| Vulnerability assessment | 5 business days |
| Patch release (critical) | 7 days |
| Patch release (other) | 30 days |

## Security Measures

### Backend
- FastAPI with Pydantic v2 input validation
- Prisma ORM (SQL injection prevention)
- Environment-based secrets management
- CORS configuration
- Rate limiting ready

### Frontend
- Next.js security defaults
- No sensitive data in client-side code
- Environment variable validation

### Infrastructure
- Docker containerization
- GitHub Actions CI/CD with security checks
- Dependency vulnerability scanning

## Security Best Practices

### For Contributors

```bash
# Never commit secrets
# Use .env.example as template
cp backend/.env.example backend/.env

# Keep dependencies updated
cd frontend && npm audit
cd backend && pip-audit
```

### For Deployment

- Use HTTPS/TLS
- Configure specific CORS origins
- Use PostgreSQL in production
- Enable rate limiting
- Regular dependency updates

## Known Security Considerations

1. **SQLite** - Use PostgreSQL for production
2. **CORS** - Configure allowed origins in production
3. **API Keys** - Always use environment variables

## Security Updates

Security patches are released as needed. Subscribe to releases to stay updated.

## Contact

For security concerns: Open a [Private Security Advisory](https://github.com/ln-one/Spectra/security/advisories/new)

---

*Last updated: 2026-02-16*
