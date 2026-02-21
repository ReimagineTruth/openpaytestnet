type PiPaymentData = {
  amount: number;
  memo: string;
  metadata?: Record<string, unknown>;
};

type PiPaymentDto = {
  identifier: string;
  user_uid: string;
  amount: number;
  memo: string;
  metadata: Record<string, unknown>;
  from_address: string;
  to_address: string;
  direction: "user_to_app" | "app_to_user";
  created_at: string;
  network: "Pi Network" | "Pi Testnet";
  status: {
    developer_approved: boolean;
    transaction_verified: boolean;
    developer_completed: boolean;
    cancelled: boolean;
    user_cancelled: boolean;
  };
  transaction: null | {
    txid: string;
    verified: boolean;
    _link: string;
  };
};

type PiPaymentCallbacks = {
  onReadyForServerApproval: (paymentId: string) => void | Promise<void>;
  onReadyForServerCompletion: (paymentId: string, txid: string) => void | Promise<void>;
  onCancel: (paymentId: string) => void;
  onError: (error: { message?: string } | Error, payment?: PiPaymentDto) => void;
};

type PiUser = {
  uid: string;
  username: string;
};

type PiAuthResult = {
  user: PiUser;
  accessToken: string;
};

type PiAdsApi = {
  isAdReady?: (
    adType: "interstitial" | "rewarded",
  ) => Promise<{ type: "interstitial" | "rewarded"; ready: boolean }>;
  requestAd?: (
    adType: "interstitial" | "rewarded",
  ) => Promise<{ type: "interstitial" | "rewarded"; result: "AD_LOADED" | "AD_FAILED_TO_LOAD" | "AD_NOT_AVAILABLE" | "ADS_NOT_SUPPORTED" }>;
  showAd?: (
    adType: "interstitial" | "rewarded",
  ) => Promise<
    | {
        type: "interstitial";
        result: "AD_CLOSED" | "AD_DISPLAY_ERROR" | "AD_NETWORK_ERROR" | "AD_NOT_AVAILABLE";
      }
    | {
        type: "rewarded";
        result:
          | "AD_REWARDED"
          | "AD_CLOSED"
          | "AD_DISPLAY_ERROR"
          | "AD_NETWORK_ERROR"
          | "AD_NOT_AVAILABLE"
          | "ADS_NOT_SUPPORTED"
          | "USER_UNAUTHENTICATED";
        adId?: string;
      }
  >;
};

type PiSdk = {
  init: (options: { version: string; sandbox?: boolean }) => void;
  authenticate: (
    scopes: string[],
    onIncompletePaymentFound?: (payment: PiPaymentDto) => void,
  ) => Promise<PiAuthResult>;
  createPayment: (payment: PiPaymentData, callbacks: PiPaymentCallbacks) => void;
  nativeFeaturesList?: () => Promise<Array<"inline_media" | "request_permission" | "ad_network">>;
  openShareDialog?: (title: string, message: string) => void;
  Ads?: PiAdsApi;
};

interface Window {
  Pi?: PiSdk;
}
