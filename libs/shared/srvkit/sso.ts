import type { Guard, SignalContext } from "akanjs/signal";
import { assertSsoConfigured } from "./ssoHelper";

// ─── Guard Classes ────────────────────────────────────────────────────

export class SSOKakao implements Guard {
  static name = "SSOKakao";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("kakao");
    return true;
  }
}

export class SSONaver implements Guard {
  static name = "SSONaver";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("naver");
    return true;
  }
}

export class SSOGithub implements Guard {
  static name = "SSOGithub";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("github");
    return true;
  }
}

export class SSOGoogle implements Guard {
  static name = "SSOGoogle";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("google");
    return true;
  }
}

export class SSOFacebook implements Guard {
  static name = "SSOFacebook";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("facebook");
    return true;
  }
}

export class SSOApple implements Guard {
  static name = "SSOApple";
  canPass(context: SignalContext): boolean {
    assertSsoConfigured("apple");
    return true;
  }
}
