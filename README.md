# PMECompta - Gestion de Tresorerie pour PME

Application web et mobile de gestion de tresorerie pour les petites et moyennes entreprises.

## Projets

```
/frontend     - Application React Web (Vite)
/mobile      - Application React Native (Expo)
```

## Installation

### Frontend Web

```bash
cd frontend
npm install
npm run dev
```

### Mobile (Expo)

```bash
cd mobile
npm install
npx expo start
```

Scan le QR code avec l'app Expo Go sur mobile.

## API

L'API partagee est dans `mobile/src/services/api.ts` - meme endpoint que le frontend web.

## Variables d'environment

Creer `.env`:

```env
VITE_API_URL=http://localhost:8000/api
```

## Pages Mobile

- **Accueil** - Dashboard avec soldes et transactions
- **Comptes** - Gestion des comptes
- **+ Transaction** - Nouvelle transaction

## Build Mobile

```bash
cd mobile
npx expo prebuild
npx expo run:ios    # ou run:android
```

## License

MIT