/// <reference path="../.astro/types.d.ts" />

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  SESSION_SECRET?: string;
  STRAND_ACCOUNTING_EMAIL?: string;
  ADMIN_EMAIL?: string;
  MAX_UPLOAD_BYTES?: string;
  APP_ORIGIN?: string;
  // Microsoft Graph (wired later — Suite Manager's M365 tenant)
  GRAPH_TENANT_ID?: string;
  GRAPH_CLIENT_ID?: string;
  GRAPH_CLIENT_SECRET?: string;
  GRAPH_SENDER_USER_ID?: string;
}

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: 'gm' | 'strand' | 'admin';
  propertyId: string | null;
};

declare namespace App {
  interface Locals {
    runtime: import('@astrojs/cloudflare').Runtime<Env>;
    user?: SessionUser | null;
  }
}
