export interface AppSecuritySettings {
  pinHash?: string;
  passwordHash?: string;
  biometricEnabled?: boolean;
  biometricCredentialId?: string;
}

export interface BiometricSupportStatus {
  supported: boolean;
  reason?: string;
  isPiBrowser: boolean;
}

const securityKey = (userId: string) => `openpay_security_${userId}`;
const unlockKey = (userId: string) => `openpay_security_unlocked_${userId}`;
const unlockPrefix = "openpay_security_unlocked_";

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64 = (base64url: string): Uint8Array => {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const loadAppSecuritySettings = (userId: string): AppSecuritySettings => {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(securityKey(userId));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as AppSecuritySettings;
  } catch {
    return {};
  }
};

export const saveAppSecuritySettings = (userId: string, settings: AppSecuritySettings) => {
  if (typeof window === "undefined") return;
  localStorage.setItem(securityKey(userId), JSON.stringify(settings));
};

export const clearAppSecurityUnlock = (userId: string) => {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(unlockKey(userId));
};

export const clearAllAppSecurityUnlocks = () => {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith(unlockPrefix)) keysToRemove.push(key);
  }
  keysToRemove.forEach((key) => sessionStorage.removeItem(key));
};

export const markAppSecurityUnlocked = (userId: string) => {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(unlockKey(userId), "1");
};

export const isAppSecurityUnlocked = (userId: string) => {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(unlockKey(userId)) === "1";
};

export const hasAnyAppSecurityMethod = (settings: AppSecuritySettings) =>
  Boolean(settings.pinHash || settings.passwordHash || (settings.biometricEnabled && settings.biometricCredentialId));

export const hashSecret = async (value: string): Promise<string> => {
  const normalized = value.trim();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

const isPiBrowserUserAgent = () => {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /pibrowser|pi browser|minepi/i.test(ua);
};

export const getBiometricSupportStatus = async (): Promise<BiometricSupportStatus> => {
  const isPiBrowser = isPiBrowserUserAgent();

  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { supported: false, reason: "Biometric checks are only available in a browser.", isPiBrowser };
  }

  if (!window.isSecureContext) {
    return {
      supported: false,
      reason: "Face ID / Fingerprint requires HTTPS secure context.",
      isPiBrowser,
    };
  }

  if (!("PublicKeyCredential" in window) || !navigator.credentials) {
    return {
      supported: false,
      reason: isPiBrowser
        ? "Pi Browser on this device does not expose biometric WebAuthn. Use PIN or security password."
        : "This browser does not support biometric WebAuthn.",
      isPiBrowser,
    };
  }

  if (
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === "function"
  ) {
    try {
      const available =
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        return {
          supported: false,
          reason: isPiBrowser
            ? "No device biometric authenticator is available in Pi Browser. Use PIN or security password."
            : "No platform authenticator is available. Set up Face ID/Fingerprint on this device first.",
          isPiBrowser,
        };
      }
    } catch {
      return {
        supported: false,
        reason: "Unable to verify biometric capability in this browser.",
        isPiBrowser,
      };
    }
  }

  return { supported: true, isPiBrowser };
};

export const isBiometricSupported = async () => (await getBiometricSupportStatus()).supported;

const toBiometricErrorMessage = (error: unknown, fallback: string) => {
  if (!(error instanceof Error)) return fallback;
  if (error.name === "NotAllowedError") {
    return "Biometric prompt was dismissed or not approved.";
  }
  if (error.name === "InvalidStateError") {
    return "Biometric credential is already registered on this device/browser.";
  }
  if (error.name === "NotSupportedError") {
    return "This device/browser does not support Face ID / Fingerprint for WebAuthn.";
  }
  if (error.name === "SecurityError") {
    return "Security requirements failed. Use HTTPS and a supported browser.";
  }
  return error.message || fallback;
};

export const registerBiometricCredential = async (userId: string, displayName: string): Promise<string> => {
  const support = await getBiometricSupportStatus();
  if (!support.supported) {
    throw new Error(support.reason || "Biometric authentication is not supported on this device.");
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userBytes = new TextEncoder().encode(userId.slice(0, 64));
  const creationOptions: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: {
      name: "OpenPay",
    },
    user: {
      id: userBytes,
      name: `${userId}@openpay.local`,
      displayName,
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    timeout: 60_000,
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
      residentKey: "preferred",
    },
    attestation: "none",
  };

  let credential: PublicKeyCredential | null = null;
  try {
    credential = (await navigator.credentials.create({
      publicKey: creationOptions,
    })) as PublicKeyCredential | null;
  } catch (error) {
    throw new Error(toBiometricErrorMessage(error, "Could not register biometric credential."));
  }

  if (!credential) throw new Error("Could not register biometric credential.");
  const rawId = new Uint8Array(credential.rawId);
  return toBase64(rawId);
};

export const verifyBiometricCredential = async (credentialId: string) => {
  const support = await getBiometricSupportStatus();
  if (!support.supported) {
    throw new Error(support.reason || "Biometric authentication is not supported on this device.");
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const idBytes = fromBase64(credentialId);

  const requestOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    timeout: 60_000,
    userVerification: "required",
    allowCredentials: [{ type: "public-key", id: idBytes, transports: ["internal"] }],
  };

  let assertion: Credential | null = null;
  try {
    assertion = await navigator.credentials.get({
      publicKey: requestOptions,
    });
  } catch (error) {
    throw new Error(toBiometricErrorMessage(error, "Biometric verification failed."));
  }

  if (!assertion) throw new Error("Biometric verification failed.");
};
