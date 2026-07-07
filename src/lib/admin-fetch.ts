export const adminFetchInit: RequestInit = {
  credentials: "include",
};

/** Same cookie session behavior for conductor portal requests. */
export const sessionFetchInit: RequestInit = adminFetchInit;
