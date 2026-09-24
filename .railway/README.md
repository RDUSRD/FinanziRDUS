# Railway IaC

Un solo archivo (`.railway/railway.ts`) describe el proyecto completo: los servicios
`api` (desde `backend/`), `web` (desde `frontend/`) y la base `Postgres`. Este repo
contiene el código de todos los servicios, así que va **un** archivo sin `partial`;
si algún día cada servicio vive en su propio repo, cada uno define su `partial`.

## Requisitos

```bash
npm install        # instala el SDK railway/iac que importa el archivo
railway login
railway link       # enlaza este directorio al proyecto y ambiente
```

## Flujo

```bash
railway config pull   # importa el estado actual de Railway al archivo
railway config plan   # muestra la diferencia, sin tocar nada
railway config apply  # aplica la diferencia (pide confirmación)
```

`apply` no interactivo con cambios destructivos:

```bash
railway config apply --yes --confirm-destructive
```

Railway **no** lee este archivo durante los deploys: se aplica cuando se corre
`plan`/`apply`, localmente o en CI. El build de cada servicio lo sigue haciendo su
`Dockerfile`.

## Cosas a tener en cuenta

- El archivo es el estado deseado completo: un recurso que no esté declarado se
  **borra** en el próximo `apply`.
- Los dominios `.up.railway.app` generados desde el dashboard **no** se gestionan
  acá; para un dominio propio se agrega `domains: [{ domain, port: 8080 }]` al `web`
  (el front escucha en 8080).
- `DATABASE_URL` se arma con las variables `PG*` del helper de Postgres para incluir
  el dialecto `+psycopg` que necesita la app.
- Las variables nuevas se declaran en el `env` del servicio; los secretos que no
  deban vivir en el repo van con `preserve()`.
- **Autenticación.** Antes de aplicar hay que cargar una vez los tres secretos en el
  servicio `api` (van con `preserve()`, así que `apply` no los escribe ni los borra):

  ```bash
  railway variables --service api --set SECRET_KEY="$(openssl rand -hex 32)"
  railway variables --service api --set ADMIN_USERNAME=rdus
  railway variables --service api --set ADMIN_PASSWORD='<clave larga y única>'
  ```

  Con `APP_ENV=production` la API **no arranca** si `SECRET_KEY` falta o quedó en el
  valor por defecto. `ADMIN_USERNAME`/`ADMIN_PASSWORD` sólo se usan para crear el
  admin la primera vez; después la contraseña vive en la base y se cambia desde la
  app (el primer ingreso la obliga a cambiar), y reiniciar con otra `ADMIN_PASSWORD`
  no la pisa. Para recuperar el acceso: `python -m app.auth_seed --reset-password`
  dentro del contenedor.

