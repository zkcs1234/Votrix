# TODO (Votrix auth RBAC bleed-through)

- [x] Identify probable client-side root cause: cached/stale role/user state used for routing.
- [x] Update auth.store.js to stop bootstrapping role/user from localStorage (initialize user as null, isAuthenticated false).
- [x] Update login flow to clear client auth state before setting session from login response.
- [ ] Verify remaining eslint/build issues and ensure `useLogin.js` compiles.
- [ ] Re-test: Organizer login → without logout login as Admin/Voter and confirm correct dashboard.
- [ ] Confirm ProtectedRoute redirects based on fresh role; ensure backend RBAC still returns 403 on unauthorized endpoints.
