declare namespace Express {
  interface Request {
    userId: string;
    ownerId: string; // kept for pipeline routes backward compat
  }
}
