# Security Policy

## Reporting a Vulnerability

We take the security of Percent Protocol seriously. If you discover a security vulnerability, we appreciate your help in disclosing it to us responsibly.

### 🔒 Please DO NOT:

- **Open a public GitHub issue** for security vulnerabilities
- **Discuss the vulnerability publicly** before it's been addressed
- **Exploit the vulnerability** beyond what's necessary to demonstrate it

### ✅ Please DO:

**Report security issues privately through one of these methods:**

1. **GitHub Security Advisories** (Preferred)
   - Go to: https://github.com/your-org/percent/security/advisories
   - Click "Report a vulnerability"
   - Provide detailed information about the issue

## What to Include in Your Report

Please provide as much information as possible:

### Required Information

- **Description**: Clear explanation of the vulnerability
- **Impact**: What an attacker could potentially do
- **Steps to Reproduce**: Detailed steps to demonstrate the issue
- **Proof of Concept**: Code or commands that demonstrate the vulnerability (if applicable)

### Helpful Additional Information

- **Affected Components**: Which parts of the system are affected
- **Severity Assessment**: Your opinion on the severity (Critical/High/Medium/Low)
- **Suggested Fix**: If you have ideas on how to fix it
- **Environment**: Version, network (mainnet/devnet), configuration details
- **Discovery Method**: How you found the vulnerability

### Example Report

```
Title: SQL Injection in Proposal Query

Description:
The proposal search endpoint does not properly sanitize user input,
allowing SQL injection attacks.

Impact:
An attacker could read sensitive data from the database or modify
proposal data.

Steps to Reproduce:
1. Navigate to /api/proposals?search=test
2. Send: /api/proposals?search=test'; DROP TABLE proposals; --
3. Observe SQL error message

Affected Component:
- File: src/routes/proposals.ts
- Lines: 60-65
- Endpoint: GET /api/proposals

Environment:
- Version: v1.0.0
- Network: Devnet
- Database: PostgreSQL 14
```

## Our Commitment

When you report a vulnerability, we commit to:

### Response Timeline

- **Initial Response**: Within 3 business days
- **Status Update**: Within 7 business days
- **Resolution Timeline**: Varies by severity (see below)

### Severity Levels

**Critical** (Fix within 7 days)
- Remote code execution
- Unauthorized fund access
- Authentication bypass
- Data breach

**High** (Fix within 14 days)
- Privilege escalation
- SQL injection
- XSS with data access
- Token theft

**Medium** (Fix within 30 days)
- Information disclosure
- CSRF vulnerabilities
- Rate limit bypass
- Session issues

**Low** (Fix within 60 days)
- Minor information leaks
- UI security issues
- Non-critical misconfigurations

### Our Process

1. **Acknowledge**: We confirm receipt of your report
2. **Investigate**: We reproduce and assess the vulnerability
3. **Develop Fix**: We create and test a patch
4. **Coordinate**: We work with you on disclosure timing
5. **Release**: We deploy the fix and publish an advisory
6. **Credit**: We acknowledge your contribution (if desired)

## Disclosure Policy

### Responsible Disclosure

We follow a **coordinated disclosure** process:

1. You report the vulnerability privately
2. We investigate and develop a fix
3. We deploy the fix to production
4. We publish a security advisory
5. You may publish your findings (after our advisory)

**Typical timeline**: 90 days from report to public disclosure

### Public Disclosure

After the fix is deployed, we will:
- Publish a security advisory
- Credit the reporter (if they wish)
- Describe the vulnerability and fix
- Notify affected users if necessary

## Scope

### In Scope

The following are in scope for security reports:

**Backend/API**
- Authentication and authorization
- Database queries and injection vulnerabilities
- API endpoint security
- Transaction validation
- Cryptographic implementations

**Smart Contract Integration**
- Solana program interactions
- Transaction construction and signing
- Token handling and transfers
- Account ownership validation

**Frontend**
- XSS and injection vulnerabilities
- Authentication issues
- Sensitive data exposure
- CSRF vulnerabilities

**Infrastructure**
- Server misconfigurations
- Exposed credentials or secrets
- Vulnerable dependencies

### Out of Scope

The following are **NOT** eligible for security reports:

- **Third-party services**: Issues in Solana, Helius, Privy, etc.
- **Denial of Service**: Network-level DoS attacks
- **Social engineering**: Phishing, pretexting, etc.
- **Physical attacks**: Physical access to servers
- **Known issues**: Already reported or documented
- **Theoretical vulnerabilities**: Without proof of concept
- **Rate limiting**: Minor rate limit issues
- **SPF/DKIM/DMARC**: Email security issues

## Bug Bounty Program

**Status**: Not currently available

We currently do not offer a bug bounty program. However:
- We deeply appreciate security research
- We will credit researchers in advisories
- We may consider bounties in the future

## Security Features

### Current Security Measures

**Authentication**
- API key authentication for protected endpoints
- Privy wallet authentication for frontend
- Transaction signature verification

**Data Protection**
- Environment variables for secrets
- Database connection encryption (SSL)
- Encryption key for sensitive database data

**Input Validation**
- Request body validation
- PublicKey format validation
- Transaction instruction validation

**Blockchain Security**
- Transaction signature verification
- Blockhash freshness validation
- Authority keypair protection

### Known Limitations

⚠️ **This software has not been formally audited**

While we follow security best practices, this codebase:
- Has not undergone a third-party security audit
- May contain undiscovered vulnerabilities
- Should be thoroughly tested before production use

**Use at your own risk**. We recommend:
- Running your own security assessment
- Starting with testnet/devnet deployments
- Monitoring for unusual activity
- Keeping dependencies updated

### Known Vulnerabilities

#### bigint-buffer (Solana Ecosystem Issue)

⚠️ **Known High-Severity Vulnerability**

**Package:** `bigint-buffer` (version <= 1.1.5)
**Issue:** Buffer overflow vulnerability
**Status:** No patch available (package appears abandoned)
**Impact:** Production dependency via `@solana/spl-token`

**Context:**
This vulnerability affects the entire Solana ecosystem and is present in most projects using `@solana/spl-token`. The `bigint-buffer` package appears to be abandoned (no patch marked as `<0.0.0`), but it remains a critical dependency throughout Solana tooling.

**Our Approach:**
- We are actively monitoring for updates from the Solana Foundation
- Watching for updates to `@solana/spl-token` and related packages
- This is a known and accepted risk across all Solana projects
- Will migrate to alternative solutions if they become available

**Mitigation:**
- The vulnerability requires specific exploitation conditions
- Our usage is limited to standard SPL token operations
- We implement additional validation layers in our token handling code
- Regular monitoring of Solana ecosystem security advisories

**Affected Components:**
- Backend: Token vault operations, proposal creation
- Frontend: Wallet interactions, token swaps

**References:**
- [npm Advisory](https://www.npmjs.com/advisories?search=bigint-buffer)
- Tracking in: `docs/SECURITY_AUDIT_RESULTS.md`

For questions about this or other security concerns, please see our reporting guidelines above.

## Security Updates

### Staying Informed

To stay informed about security updates:
- **Watch the repository** on GitHub for security advisories
- **Check releases** for security patches
- **Monitor dependencies** for vulnerable packages

### Updating

When security updates are released:
1. Review the security advisory
2. Update to the latest version immediately
3. Test in a staging environment
4. Deploy to production
5. Monitor for issues

## Contact

For security concerns:
- **Security Reports**: GitHub Security Advisories (preferred)
- **General Questions**: https://github.com/your-org/percent/issues

**Please do not use public channels for security vulnerabilities.**

## Hall of Fame

We recognize security researchers who help improve Percent Protocol:

<!-- List will be populated as vulnerabilities are responsibly disclosed -->

*No vulnerabilities responsibly disclosed yet.*

---

Thank you for helping keep Percent Protocol secure! 🔒
