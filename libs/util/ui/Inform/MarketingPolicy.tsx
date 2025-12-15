import { HtmlContent } from "../HtmlContent";

interface MarketingPolicyProps {
  className?: string;
  companyName: string;
  serviceName: string;
}
export const MarketingPolicy = ({ className, companyName, serviceName }: MarketingPolicyProps) => {
  const content = `<p>마케팅 정보 수신 동의
  개인정보보호법 제22조 제4항에 의해 선택정보 사항에 대해서는 기재하지 않으셔도 서비스를 이용하실 수 있습니다.
  1. 마케팅 및 광고에의 활용
  신규 기능 개발 및 맞춤 서비스 제공
  뉴스레터 발송, 새로운 기능(제품)의 안내
  할인 및 쿠폰 등 이벤트 등의 광고성 정보 제공
  2. 마케팅 정보 제공
  ${companyName}는 ${serviceName} 서비스를 운용하는 과정에서 각종 정보를 서비스 화면, SMS, 푸시 알림, 이메일 등의 방법으로 회원에게 제공할 수 있으며, 결제 안내 등 의무적으로 안내해야 하는 정보성 내용 및 일부 혜택성 정보는 수신동의 여부와 무관하게 제공합니다.
  3. 수신 동의 및 철회
  ${companyName}에서 제공하는 마케팅 정보를 원하지 않을 경우 ‘내 프로필 > 설정  >  마케팅 수신 동의’에서 철회를 요청할 수 있습니다. 또한 향후 마케팅 활용에 새롭게 동의하고자 하는 경우 ‘내 프로필 > 설정 > 마케팅 수신 동의 설정’에서 동의하실 수 있습니다.</p>`.replace(
    /\n/g,
    "</p><p>"
  );
  return <HtmlContent className={className} content={content} />;
};
