# Supabase Migrations

## Structure

```
supabase/
├── config.toml                     # Configuration Supabase CLI
├── migrations/                     # Source of truth pour le schéma
│   ├── 20241212000000_initial_schema.sql
│   ├── 20241215090000_add_product_categories.sql
│   ├── 20241215100000_remove_product_image.sql
│   ├── 20241215110000_add_siren_to_clients.sql
│   ├── 20241216090000_add_invoice_subject_footer.sql
│   ├── 20241217090000_reminder_system.sql
│   ├── 20241217100000_quotes_invoices_payments_system.sql
│   ├── 20241219090000_add_subject_to_quotes.sql
│   ├── 20241219100000_add_terms_and_conditions.sql
│   ├── 20241219110000_add_company_id_to_reminders.sql (neutralisée)
│   ├── 20241220090000_add_credit_note_type.sql
│   ├── 20260131090000_fix_user_signup_trigger.sql
│   ├── 20260216090000_enhanced_signup_with_company.sql
│   ├── 20260309090000_roles_and_permissions.sql
│   ├── 20260310090000_phase2_subscriptions_accountant_members.sql
│   ├── 20260311100000_role_based_registration.sql
│   ├── 20260312110000_normalize_invitation_emails.sql
│   ├── 20260314090000_add_max_members_to_plans.sql
│   └── 20260317100000_company_owner_quotas.sql
└── schema.sql                      # Référence complète (non utilisé pour migrations)
```

## Déployer avec Supabase CLI

### Installation
```bash
npm install -g supabase
```

### Connexion au projet
```bash
supabase login
supabase link --project-ref sxdofugjiqjlfuklfwjd
```

### Appliquer les migrations
```bash
supabase db push
```

### Créer une nouvelle migration
```bash
supabase migration new nom_de_la_migration
```

### Clean reset (recommandé en dev local)
```bash
supabase db reset
```

Cette commande rejoue toutes les migrations dans l'ordre des timestamps.

### Vérifier l'ordre et l'état des migrations
```bash
supabase migration list
```

## Ordre de migration attendu

1. `20241212000000_initial_schema.sql`
2. `20241215090000_add_product_categories.sql`
3. `20241215100000_remove_product_image.sql`
4. `20241215110000_add_siren_to_clients.sql`
5. `20241216090000_add_invoice_subject_footer.sql`
6. `20241217090000_reminder_system.sql`
7. `20241217100000_quotes_invoices_payments_system.sql`
8. `20241219090000_add_subject_to_quotes.sql`
9. `20241219100000_add_terms_and_conditions.sql`
10. `20241219110000_add_company_id_to_reminders.sql` (no-op)
11. `20241220090000_add_credit_note_type.sql`
12. `20260131090000_fix_user_signup_trigger.sql`
13. `20260216090000_enhanced_signup_with_company.sql`
14. `20260309090000_roles_and_permissions.sql`
15. `20260310090000_phase2_subscriptions_accountant_members.sql`
16. `20260311100000_role_based_registration.sql`
17. `20260312110000_normalize_invitation_emails.sql`
18. `20260314090000_add_max_members_to_plans.sql`
19. `20260317100000_company_owner_quotas.sql`

## Notes importantes

- Le schéma reminders (`reminders`, `reminder_settings`, `email_templates`) est défini uniquement dans `20241217090000_reminder_system.sql`.
- La migration `20241217100000_quotes_invoices_payments_system.sql` ne redéfinit plus ces tables pour éviter les conflits de schéma.
- Les migrations sont la seule source de vérité fonctionnelle.
- `schema.sql` et `supabase_full_setup.sql` doivent rester alignés avec les migrations, mais `supabase db reset` / `supabase db push` restent la méthode de référence en local.

---

## Déploiement Manuel (Dashboard)

1. Allez sur [SQL Editor](https://sxdofugjiqjlfuklfwjd.supabase.co/project/default/sql)
2. Exécutez les migrations dans l'ordre listé ci-dessus (une par une si vous êtes en mode manuel)
3. Cliquez **Run** après chaque migration

---

## Storage Buckets

Créez manuellement après la migration :

| Bucket | Public | Taille max |
|--------|--------|------------|
| `documents` | ❌ Non | 50 MB |
| `public-images` | ✅ Oui | 5 MB |

---

## ⚠️ Configuration Production

Avant de passer en production, **modifiez obligatoirement** les URLs suivantes :

### 1. Google Cloud Console
Dans [APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials) :

| Paramètre | Développement | Production |
|-----------|---------------|------------|
| Authorized JavaScript origins | `http://localhost:5173` | `https://votre-domaine.com` |
| Authorized redirect URIs | `https://xxx.supabase.co/auth/v1/callback` | (identique) |

### 2. Supabase Dashboard
Dans [Authentication → URL Configuration](https://sxdofugjiqjlfuklfwjd.supabase.co/project/sxdofugjiqjlfuklfwjd/auth/url-configuration) :

| Paramètre | Valeur Production |
|-----------|-------------------|
| Site URL | `https://votre-domaine.com` |
| Redirect URLs | `https://votre-domaine.com/dashboard` |

### 3. Variables d'environnement Backend

```env
CORS_ORIGIN=https://votre-domaine.com
NODE_ENV=production
```

### 4. Variables d'environnement Frontend

```env
VITE_API_URL=https://api.votre-domaine.com
```

### 5. Frontend - Modifier la redirection OAuth
Dans `src/lib/supabase.ts`, vérifiez que `redirectTo` pointe vers votre domaine de production.
