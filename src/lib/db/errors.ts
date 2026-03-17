type DatabaseErrorLike = {
  code?: string;
  message?: string;
};

function asDatabaseError(error: unknown): DatabaseErrorLike | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  return error as DatabaseErrorLike;
}

export function isMissingDatabaseRelationError(error: unknown) {
  const databaseError = asDatabaseError(error);

  if (!databaseError) {
    return false;
  }

  return (
    databaseError.code === "42P01" ||
    Boolean(databaseError.message && /relation .* does not exist/i.test(databaseError.message))
  );
}

export function isMissingUsersTableError(error: unknown) {
  const databaseError = asDatabaseError(error);

  if (!databaseError?.message) {
    return false;
  }

  return /relation "users" does not exist/i.test(databaseError.message);
}

export function isForeignKeyViolationError(error: unknown) {
  const databaseError = asDatabaseError(error);

  if (!databaseError) {
    return false;
  }

  return (
    databaseError.code === "23503" ||
    Boolean(databaseError.message && /foreign key/i.test(databaseError.message))
  );
}
