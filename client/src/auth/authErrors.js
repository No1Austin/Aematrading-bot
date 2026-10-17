/** Convert Supabase Auth errors into safe, actionable messages for users. */
export function getAuthErrorMessage(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  const status = Number(error?.status);

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Incorrect email or password. Please check your credentials and try again.";
  }
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) {
    return "Your email address has not been verified. Check your inbox for the confirmation link.";
  }
  if (code === "email_exists" || code === "user_already_exists") {
    return "Registration could not be completed with those details. Try signing in or resetting your password.";
  }
  if (
    code === "weak_password" ||
    message.includes("password should") ||
    message.includes("password is too weak")
  ) {
    return "Your password does not meet the security requirements. Choose a stronger password.";
  }
  if (code === "email_address_invalid") {
    return "Please enter a valid email address.";
  }
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    status === 429
  ) {
    return "Too many requests. Please wait a few minutes before trying again.";
  }
  if (code === "user_banned") {
    return "This account is currently unavailable. Please contact support.";
  }
  if (
    message.includes("failed to fetch") ||
    message.includes("network request failed") ||
    message.includes("networkerror")
  ) {
    return "Unable to connect to the authentication server. Check your internet connection and try again.";
  }
  if (status >= 500) {
    return "The authentication service is temporarily unavailable. Please try again later.";
  }
  return "Authentication could not be completed. Please try again. If the problem continues, contact support.";
}
