# Clieto Fit Mobile

The Android and iOS app is a separate Expo / React Native project. It uses the
existing REST API for sign-in, authorization, gym data, and attendance; it does
not connect directly to PostgreSQL or Supabase.

## Requirements and setup

Use Node.js 24.3+ (or another version listed in this workspace's `engines`
field) and npm. Expo SDK 58 does not support Node 25. From the repository root,
install dependencies and start the API and Expo app in separate terminals:

```powershell
npm install
npm run dev:api
```

In another terminal:

```powershell
npm run dev:mobile
```

Before starting Expo, copy `apps/mobile/.env.example` to
`apps/mobile/.env` and set `EXPO_PUBLIC_API_URL` to the API address reachable
by your device.

For local development, start the API from the repository root with
`npm run api:dev`. Set `EXPO_PUBLIC_API_URL` to a host reachable from the mobile
runtime:

- Android emulator: `http://10.0.2.2:3001`
- iOS simulator: `http://127.0.0.1:3001`
- Physical device: `http://<your-computer-LAN-IP>:3001`

The API and phone must be reachable on the same network for a physical-device
development session. Use an HTTPS API URL for production builds.

## Run and validate

```powershell
npm run android --workspace=@clieto-fit/mobile
npm run ios --workspace=@clieto-fit/mobile
npm run typecheck --workspace=@clieto-fit/mobile
Set-Location apps\mobile
npx expo-doctor
```

Expo Go or an Android emulator can run the app from Windows. Building or
simulating the iOS native app requires macOS and Xcode; a physical iPhone can
also use an Expo development build distributed with EAS.

## App capabilities

- Role-aware sign-in for members, gym admins, and Super Admins.
- Secure, platform-backed storage for the API bearer token. The app checks
  saved sessions against the API and revokes sessions on sign-out.
- Overview metrics and role-scoped member, training, diet, attendance, fee,
  payment, offer, and equipment views.
- Member self check-in and admin check-in for an active gym member.
- Responsive layouts using native React Native components and horizontally
  scrollable navigation for smaller screens.

The server remains authoritative for role access, tenant boundaries, payment
state, and attendance rules. This app does not promise vulnerability-free
software; production use still requires HTTPS, supported dependency updates,
device and API testing, and a deployment security review.
