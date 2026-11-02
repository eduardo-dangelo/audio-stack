# App Store Connect — Lite / Plus / Pro IAP setup

Create these products before TestFlight purchase testing. Product IDs must match the app.

## Prerequisites

1. App Store Connect → **Agreements, Tax, and Banking** → Paid Apps agreement **Active**
2. Banking and tax forms completed for your legal entity

## Products

### Plus (lifetime)

| Field | Value |
|---|---|
| Type | **Non-Consumable** |
| Product ID | `com.eduardodangelo.voicememosplus.plus` |
| Reference name | Voicer Pro Plus |
| Price | £9.99 (or matching price tier) |
| Availability | All territories you ship to |

Localization example:

- Display name: **Plus**
- Description: Unlimited recordings and layers, custom effects, import, and M4A export.

### Pro (monthly)

| Field | Value |
|---|---|
| Type | **Auto-Renewable Subscription** |
| Subscription group | e.g. `voicer_pro_access` (create if needed) |
| Product ID | `com.eduardodangelo.voicememosplus.pro.monthly` |
| Duration | 1 month |
| Price | £9.99 / month |

Localization example:

- Display name: **Pro**
- Description: Everything in Plus, plus WAV and project (.vcr) export. Future Pro tools (quantize, distortion, automation) coming soon.

## Sandbox testing

1. Users and Access → **Sandbox** → create a Sandbox Apple ID
2. On device: Settings → App Store → Sandbox Account (or sign out of media Apple ID as needed)
3. IAP does **not** work in the iOS Simulator — use a physical device
4. After changing products, wait a few minutes / rebuild if SKUs are missing in `fetchProducts`

## App metadata / Review

- Privacy policy: disclose that optional in-app purchases unlock features; no account required for Lite
- App Review notes: provide Sandbox tester credentials; path **Settings → Plan** and **Restore Purchases**
- Binary must include the In-App Purchase capability (added via `expo-iap` + prebuild)

## Entitlement rules (product)

- **Plus** is permanent (non-consumable)
- **Pro** is an active subscription
- Effective access: Pro (if subscribed) → else Plus (if owned) → else Lite
- Canceling Pro while owning Plus leaves the user on **Plus**
