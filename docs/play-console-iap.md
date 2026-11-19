# Google Play Console — Lite / Plus / Pro IAP setup

Create these products before Internal testing purchase checks. Product IDs must match the app.

Play product IDs are limited to **40 characters**. The App Store Pro SKU (`…pro.yearly`) is 44 characters, so Android uses a shorter Pro product ID. See also [App Store Connect IAP](./app-store-connect-iap.md).

## Prerequisites

1. Play Console → payments / merchant profile linked and active
2. App package `com.eduardodangelo.voicememosplus` on a testing track (Internal is fine)
3. License testers added (Setup → License testing)

## Products

### Plus (lifetime)

| Field | Value |
|---|---|
| Type | One-time / managed (Buy, not Rent) |
| Product ID | `com.eduardodangelo.voicememosplus.plus` |
| Purchase option ID | `lifetime` |
| Name | Audio Stack Plus |
| Price | £9.99 (or matching tier) |

Description example:

- Audio Stack Plus unlocks unlimited recordings and layers, custom effects, folders, merge, high-quality M4A, and WAV export. One-time purchase.

### Pro (yearly)

| Field | Value |
|---|---|
| Type | Subscription |
| Product ID | `com.eduardodangelo.voicememosplus.pro` (37 chars; **not** `…pro.yearly`) |
| Base plan ID | `yearly` |
| Duration | 1 year auto-renew |
| Price | £19.99 / year |

Benefits (≤40 chars each), example:

1. Loop and duplicate tracks  
2. Pitch control  
3. Project (.aud) export  
4. Everything included in Plus  

Description (≤200 chars), example:

- Audio Stack Pro (yearly): loop, duplicate, pitch, project (.aud) export, themes, and everything in Plus. Cancel anytime in Google Play.

Recommended subscription settings:

- Grace period: on  
- Account hold: on  
- Customer base plan / offer changes: new customers only  

## Testing

1. Add license-tester Gmail accounts in Play Console  
2. Install a build from Internal (or closed) testing — Play App Signing  
3. Purchase with the tester account (no real charge when configured correctly)  
4. After changing products, wait a few minutes; rebuild if SKUs are missing in `fetchProducts`

## Entitlement rules (product)

- **Plus** is permanent (one-time)  
- **Pro** is an active subscription (`…pro` on Play, `…pro.yearly` on App Store)  
- Effective access: Pro (if subscribed) → else Plus (if owned) → else Lite  
- Canceling Pro while owning Plus leaves the user on **Plus**
