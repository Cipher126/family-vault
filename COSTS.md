# Cost model

Checked against official Cloudflare documentation on 20 October 2026. Provider prices and allowances can change; confirm them before deployment.

## Expected initial cost

For a small family, the design targets **$0/month in usage charges**, subject to remaining inside current free allowances and Cloudflare's account/billing requirements.

- Workers Free currently includes 100,000 requests/day and 10 ms CPU per request.
- D1 Free currently allows 10 databases, 500 MB per database, and 5 GB total per account. Daily row read/write limits are enforced.
- R2 Standard currently includes 10 GB-month storage, 1 million Class A operations, and 10 million Class B operations monthly, with free internet egress.
- Beyond the R2 Standard storage allowance, the published storage rate is currently $0.015/GB-month; operations can also become billable.

R2 activation currently requires completing a checkout/subscription flow. Free allowance does not mean a universal hard spending cap, and this application cannot see the final provider bill.

## Controls in the application

The default family quota is 8 GiB, below the nominal 10 GB-month free allowance. The database records exact bytes for every object variant, rejects uploads that exceed the quota, and shows a warning threshold and estimated storage-only amount. The administrator can lower limits at any time.

The estimate does not include operation rounding, other account resources, taxes, currency conversion, or price changes. Cloudflare's bill is authoritative.

## When the family grows

1. Review preserved originals; they dominate storage. Do not discard them unless a verified independent backup exists.
2. Raise the quota only after setting a Cloudflare billing notification and understanding that notifications are not hard caps.
3. At 50 GB retained beyond the 10 GB free allowance, storage alone would be roughly 40 × $0.015 = $0.60/month at the current published rate, before operation charges and rounding.
4. Continue with R2 Standard for actively viewed photos. Infrequent Access has retrieval fees and no free tier, so it is not automatically cheaper for this use case.

Official references: Cloudflare Workers limits, D1 limits/pricing, and R2 pricing in the provider documentation.
