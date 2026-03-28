// Sprint 5 — Google Identity Services Window augmentation
// GoogleCredentialResponse is defined in lib/auth.ts and imported where needed.
// This file only augments the Window interface so components can call window.google.*

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            callback: (response: any) => void;
            auto_select?: boolean;
          }) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
          renderButton: (element: HTMLElement, options: object) => void;
        };
      };
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    googleSignInCallback?: (response: any) => void;
  }
}

export {};
