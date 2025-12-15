import { scalarDictionary } from "@akanjs/dictionary";

import type { AccessLog } from "./accessLog.constant";

export const dictionary = scalarDictionary(["en", "ko"])
  .of((t) => t(["Access Log", "액세스 로그"]).desc(["Access log information", "액세스 로그 정보"]))
  .model<AccessLog>((t) => ({
    period: t(["Period", "기간"]).desc(["Time period", "시간 기간"]),
    countryCode: t(["Country Code", "국가 코드"]).desc(["ISO country code", "ISO 국가 코드"]),
    countryName: t(["Country Name", "국가 이름"]).desc(["Name of the country", "국가 이름"]),
    city: t(["City", "도시"]).desc(["City name", "도시 이름"]),
    postal: t(["Postal", "우편번호"]).desc(["Postal code", "우편번호"]),
    location: t(["Location", "위치"]).desc(["Geographic location", "지리적 위치"]),
    ipv4: t(["IPv4", "아이피"]).desc(["IPv4 address", "IPv4 주소"]),
    state: t(["State", "주"]).desc(["State or province", "주 또는 도"]),
    osName: t(["OS Name", "OS 이름"]).desc(["Operating system name", "운영체제 이름"]),
    osVersion: t(["OS Version", "OS 버전"]).desc(["Operating system version", "운영체제 버전"]),
    browserName: t(["Browser Name", "브라우저 이름"]).desc(["Web browser name", "웹 브라우저 이름"]),
    browserVersion: t(["Browser Version", "브라우저 버전"]).desc(["Web browser version", "웹 브라우저 버전"]),
    mobileModel: t(["Mobile Model", "모바일 모델"]).desc(["Mobile device model", "모바일 디바이스 모델"]),
    mobileVendor: t(["Mobile Vendor", "모바일 벤더"]).desc(["Mobile device vendor", "모바일 디바이스 제조사"]),
    deviceType: t(["Device Type", "디바이스 타입"]).desc(["Type of device", "디바이스 타입"]),
    at: t(["At", "시간"]).desc(["Access time", "액세스 시간"]),
  }));
