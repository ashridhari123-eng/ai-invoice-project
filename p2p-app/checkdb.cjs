/* eslint-disable @typescript-eslint/no-require-imports */
const Database = require("better-sqlite3");
const db = new Database("./prisma/dev.db", { readonly: true });
const users = db.prepare(`SELECT email, name, roleId FROM "User"`).all();
console.log("USERS:", JSON.stringify(users, null, 1));
const roles = db.prepare(`SELECT id, code, name FROM "Role"`).all();
console.log("ROLES:", JSON.stringify(roles, null, 1));
db.close();
