import { usePage } from "@util/client";

import { HtmlContent } from "../HtmlContent";

interface PrivacyPolicyProps {
  className?: string;
  companyName: string;
  policy?: {
    company: {
      ceo: string;
      address: string;
      phone: string;
    };
    customerService: {
      department: string;
      email: string;
    };
    privacyManager: {
      name: string;
      phone: string;
      email: string;
    };
    privacyAuthority: {
      name: string;
      phone: string;
      email: string;
    };
    locationAuthority: {
      name: string;
      email: string;
    };
  };
  startDateStr?: string;
}

export const PrivacyPolicy = (props: PrivacyPolicyProps) => {
  const { l, lang } = usePage();

  return lang === "en" ? <PrivacyPolicyEn {...props} /> : <PrivacyPolicyKo {...props} />;
};

const PrivacyPolicyKo = ({
  className,
  companyName,
  policy = {
    company: {
      ceo: "My Name",
      address: "My Address",
      phone: "010-8888-8888",
    },
    customerService: {
      department: "My Department",
      email: "my-email@my-domain.com",
    },
    privacyManager: {
      name: "My Name",
      phone: "010-8888-8888",
      email: "my-email@my-domain.com",
    },
    privacyAuthority: {
      name: "My Name",
      phone: "010-8888-8888",
      email: "my-email@my-domain.com",
    },
    locationAuthority: {
      name: "My Name",
      email: "my-email@my-domain.com",
    },
  },
  startDateStr = "2023년 1월 1일",
}: PrivacyPolicyProps) => {
  const content =
    `<p>${companyName}는 이용자의 개인정보를 소중히 다루고 있습니다. ${companyName}는 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」을 비롯한 관련 법규상의 개인정보 보호규정 및 개인정보 보호지침을 준수하며, 관련 법령에 의거한 개인정보 처리방침을 제정하여 이용자의 권익 보호에 최선을 다하고 있습니다.
      ${companyName} 개인정보 처리방침
      ${companyName}(이하 '회사')는 이용자의 동의를 받아 개인정보를 수집·이용 및 제공하고 있습니다. 또한 이용자의 개인정보 자기결정권을 적극적으로 보장합니다. ${companyName}는 개인정보 처리방침을 통해 수집하는 개인정보의 종류, 이용목적, 처리방침 등을 안내하고 개인정보보호를 위해 어떠한 조치가 취해지고 있는지 알려드림으로써 이용자가 보장된 권리에 따라 안심하고 서비스를 이용할 수 있도록 노력하고 있습니다.
      회사는 원활한 서비스를 제공하고 더욱 향상된 고객 경험을 드리기 위하여 필요한 고객의 개인정보를 수입 또는 이용합니다. 고객이 동의한 이용약관에 따라 서비스의 기본 기능이나 여러 특화된 기능을 제공하기 위해서 고객의 이메일 또는 SNS 계정, 출생년도, 성별, 사용기기 등의 확인이 필요한 경우가 있습니다. 또한 고객이 개인정보를 고객에게 개별적으로 알려 드릴 사항이 있을 때나 서비스 이용과 관련하여 문의나 분쟁이 있을 경우, 유료 서비스 이용시 젤리의 구입 및 요금 결제를 위해서도 필요합니다.
      그 외에도 새로운 서비스 개발 및 기능 개선, 맞춤형 서비스 제공 및 광고 게재, 각종 이벤트 및 광고성 정보의 제공 및 참여 기회 제공, 법령 등에 규정된 의무와 이행 법령이나 이용약관에 반하여 고객에게 피해를 줄 수 있는 잘못된 이용행위를 방지 및 차단 등을 위해서도 여러분의 개인정보가 필요합니다.
      1. 수집하는 개인정보 항목 및 수집방법
      1). 수집하는 개인정보 항목
      가. 회원가입 시 수집하는 정보
      ${companyName} 회원가입, 원활한 고객상담, 각종 서비스의 제공을 위해 회원가입시 아래와 같은 개인정보를 수집하고 있습니다. 선택수집 항목은 입력하지 않아도 회원가입이 가능합니다.
      - 필수수집 항목 : 이름, 이메일주소, 전화번호, 사진, 주소록, 비밀번호, 닉네임, 생년월일, 성별, , 휴대폰 번호, 마케팅 수신 동의여부, 위치정보(지역)
      - 선택수집 항목 : 전공, 직장, 학교, 직업,
      - 연봉, 차량, 주거형태, 몸무게, 시력, 혼인이력, 연애상태 등은 추가서비스 및 설문조사를 통해 다양한 정보 수집 및 제공에 필요시 정보주체가 그 수집에 동의하는 경우 추가로 수집될 수 있습니다.
      나. 서비스 이용과정이나 사업처리 과정에서의 수집정보
      - IP Address, 방문 일시, 서비스 이용 기록, 불량 이용 기록, 접속 로그
      - 서비스 사용 중일 때 귀하의 모바일 기기의 지리적 위치
      - 모바일 단말기 정보, 국가정보 (MCC)
      - 광고 식별자 정보 (ADID, IDFA)
      다. 고객센터 이용시 또는 이벤트 응모시 수집정보
      고객센터 이용시 또는 이벤트 응모시에는 고충처리, 경품발송 및 세금신고 등을 위해 회원가입시 수집하지 않은 개인정보를 추가로 수집할 수 있습니다. 아래의 항목 이외에도 유형에 따라 추가 수집하는 개인정보가 있을 수 있습니다. 이 과정에서 수집 관련 내용을 안내하고 별도 동의를 받습니다.
      - 고객센터 : 전화번호, 이메일주소, 실명 변경 정보 등
      - 이벤트 응모 및 당첨 : 이름, 전화번호, 이메일주소, 배송지주소, 주민등록번호*
      ▶ 주민등록번호 수집 : 당첨자의 제세공과금 처리 등을 위해 관련법에 따라 수집해야하는 경우에 한하며, 수집시 별도 동의를 받습니다.
      2). 개인정보 수집방법
      회사는 다음과 같은 방법으로 개인정보를 수집하고 있습니다.
      - 회원가입 및 서비스 이용과정에서 개인정보 수집에 대해 동의를 하고 직접 정보를 입력
      - 홈페이지, 모바일앱, 모바일웹, 서면 양식, 전화, FAX, 문의메일, SNS, 게시판
      - 이벤트 응모, 배송 요청
      - 생성정보 수집 툴을 통한 수집
      - 협력회사로부터 공동 제휴 및 협력을 통한 정보 수집
      2. 개인정보의 수집 및 이용 목적
      회사는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 개인정보 보호법 제 18조에 따라 별도의 동의를 받는 등 필요한 조치를 이행할 예정입니다.
      1). 서비스 제공에 관한 계약 이행, 부가서비스 제공 및 회원 관리
      매칭 서비스 및 콘텐츠 제공, 회원제 서비스 이용에 따른 본인확인, 개인 식별, 가입의사 확인, 연령 확인, 가입 및 가입횟수 제한, 부가서비스 제공을 위한 고유 이용자 특정, 불량회원의 부정이용 및 비인가 사용 방지, 회원탈퇴 후 24시간내 재가입 방지, 불만처리 등 민원처리, 분쟁조정을 위한 기록보존, 안내사항 전달, 회원탈퇴 의사의 확인
      2). 이벤트 관리
      이벤트 응모, 당첨확인 및 관련안내, 경품 발송, 관련 민원처리, 세금신고
      3). 마케팅 및 광고에 활용
      신규 서비스(제품) 개발 및 특화, 이벤트 등 광고성 정보 전달, 인구통계학적 특성에 따른 서비스 제공 및 광고 게재, 접속 빈도 파악 또는 회원의 서비스 이용에 대한 통계, 서비스의 유효성 확인
      4). 수집한 개인정보 이용 및 제 3자 제공
      회사는 통계작성, 학술연구 또는 시장조사를 위하여 필요하다면 이용자가 제공한 개인정보를 식별할 수 없는 형태로 가공하여 제3자에게 제공할 수 있습니다.
      3. 개인정보의 보유 및 이용 기간
      회원가입시 및 서비스 이용 중 수집된 정보는 회원탈퇴시 혹은 개인정보 수집 및 이용목적이 달성된 때까지 3개월간 보존하며 이후에는 해당 정보를 지체 없이 파기합니다. 단, 다음의 정보에 대해서는 하기의 이유로 회원탈퇴 후에도 명시한 기간 동안 해당 정보를 보존합니다.
      1). 회사 내부 방침에 의한 정보보유 사유
      가. 부정이용 기록
      - 보존 항목 : 부정이용기록(부정가입, 규정위반 기록 등 비정상적 서비스 이용기록)
      - 보존 이유 : 부정가입 및 부정이용 방지
      - 보존 기간 : 3년
      나. 반복적 탈퇴/재가입 방지를 위한 정보
      회원 탈퇴한 경우에는 회원 재가입, 임의 해지등을 반복적으로 행함으로써 ${companyName}가 제공하는 서비스의 부정이용 및 이벤트 혜택 등의 이익 등을 불·편법적으로 수취하거나 이 과정에서 명의도용 등의 우려가 있으므로 이러한 행위의 차단 목적으로 회원 탈퇴 후 3개월 동안 회원정보를 보관합니다.
      - 보존 항목 : 아이디(이메일주소), 비밀번호, 휴대폰 번호, 기기 정보
      - 보존 이유 : 재가입, 임의해지 등의 부정이용 방지
      - 보존 기간 : 3개월
      다. 개인정보 유효기간제 도입에 따른 개인정보 분리보관 및 휴면계정의 복원을 위한 정보
      서비스를 장기간 이용하지 않는 이용자의 회원정보에 포함된 개인정보는 별도로 분리보관됩니다. 서비스를 재이용하고 싶은 경우에는 휴면해치처리 선택을 거쳐 정상아이디로 복원할 수 있습니다.
      - 분리보관 항목 : 회원정보에 포함된 개인정보(필수, 선택정보 포함)
      ▶ 분리보관 기준 : 기준 시점으로부터 1년 내 미로그인한 경우 휴면계정으로 전환 및 개인정보 분리보관
      ▶ 분리보관 제외 : 휴면통지 및 복원에 필요한 정보, 법령의 규정 및 내부 규정에 따라 보존할 필요성이 있는 정보 제외
      - 분리보관 이유 : 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」에 따른 장기 미이용자 개인정보 보호
      - 분리보관 기간 : 휴면계정 전환 이후 3년
      2). 관련법령에 의한 정보보유 사유
      「전자상거래 등에서의 소비자보호에 관한 법률」 등 관계법령의 규정에 의하여 보존할 필요가 있는 경우 ${companyName}는 관계법령에서 정한 일정한 기간 동안 회원정보를 보관합니다. 이 경우 ${companyName}는 보관하는 정보를 그 보관의 목적으로만 이용하며 보존기간은 아래와 같습니다.
      - 서비스 이용 기록, 접속 로그, 접속 IP 정보 : 3 개월 (통신 비밀 보호법)
      -표시 / 광고에 관한 기록 : 6 개월 (전자 상거래 등에서의 소비자 보호에 관한 법률)
      -계약 또는 청약 철회 등에 관한 기록 : 5 년 (전자 상거래 등에서의 소비자 보호에 관한 법률)
      -대금 결제 및 재화 등의 공급에 관한 기록 : 5 년 (전자 상거래 등에서의 소비자 보호에 관한 법률)
      -소비자의 불만 또는 분쟁 처리에 관한 기록 : 3 년 (전자 상거래 등에서의 소비자 보호에 관한 법률)
      -다만 서비스의 부정한 이용으로 인한 분쟁을 방지하기 위한 내부방침에 따라 서비스의 부정 이용 기록은 1년간 보존한 다음 파기됩니다.
      4. 개인정보의 취급위탁
      고객이 서비스 이용과정 등에서 따로 동의하는 경우나 법령에 규정된 경우를 제외하고는 고객의 개인 정보를 위에서 말씀드린 목적 범위를 초과하여 이용하거나 제3자에게 제공 또는 공유하지 않습니다.하지만 서비스 향상, 법령이나 이용 약관에 반하여 다른 고객에게 피해를 줄 수 있는 잘못된 이용행위의 차단, 방지 및 안정적인 개인정보 취급을 위해서 고객의 개인정보를 외부에 위탁하여 처리할 수 있습니다. 위탁처리 기관 및 위탁업무의 내용은 아래를 참조해 주세요.
      1) 계정 정보 취급위탁
      - 위탁정보 : 계정 정보
      - 수탁업체 : Amazon Web Service.Inc
      - 개인정보의 보유 및 이용기간 : 회원탈퇴시 혹은 위탁계약 종료시까지 (다만, 부정이용기록이나 법령상 보존의무가 있는 정보에 관해서는 해당 정보의 보유기간까지 위탁함)
      2) 알림 취급위탁
      - 위탁정보 : 카카오톡 알림톡 전송
      - 개인정보의 보유 및 이용기간 : 카카오톡 사용 중단 또는 알림톡 수신 거부시
      3) 메일 전송 위탁
      - 위탁정보 : 메일 전송
      - 개인정보의 보유 및 이용기간 : 회원탈퇴시 혹은 위탁계약 종료시까지
      4) 문자 전송 위탁
      - 위탁정보 : 문자 전송
      - 개인정보의 보유 및 이용기간 : 회원탈퇴시 혹은 위탁계약 종료시까지
      1. 개인정보의 공개 및 연동
      ${companyName} 이용자의 동의가 있거나 법률의 규정에 의한 경우를 제외하고는 어떠한 경우에도 이용 범위를 넘어 이용자의 개인정보를 이용하거나 외부에 공개하지 않습니다. 이용자의 개인정보를 외부와 공유하는 경우에는 사전에 해당 사실을 알리고 동의를 구하는 절차를 거치게 되며, 이용자들의 동의가 없는 경우에는 추가적인 정보를 임의로 수집하거나 공유하지 않습니다. 단, 아래의 경우는 예외로 합니다.
      1) 이용자가 동의한 경우
      - 이용자가 사전에 공개한 경우
      - 이용자가 연동에 동의한 경우
      ▶ 이벤트 참가시 정보제공 가능함을 미리 안내합니다. 부정확한 개인정보 혹은 개인정보 누락시 이벤트 당첨 등은 취소됩니다.
      2) 법령의 규정에 의거하여 적법한 절차에 따른 요청이 있는 경우
      - 법령의 규정에 의거하여 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우
      - 법령의 규정에 의거하여 분쟁조정 등의 목적으로 법령에 정해진 절차와 방법에 따라 관련기관의 요구가 있는 경우
      - 기타 법령의 규정에 의거한 경우
      3) 기타
      - 서비스 제공에 따른 요금 정산을 위하여 필요한 경우
      - 통계작성, 학술연구 또는 시장조사를 위하여 개인을 식별 할 수 없는 형태로 제공하는 경우
      - 정보주체 또는 그 법정대리인이 의사표시를 할 수 없는 상태에 있거나 주소불명 등으로 사전 동의를 받을 수 없는 경우로서 명백히 정보주체 또는 제3자의 급박한 생명, 신체, 재산의 이익을 위하여 필요하다고 인정되는 경우
      6. 개인정보의 파기절차 및 방법
      이용자의 개인정보는 원칙적으로 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체없이 파기합니다. 파기절차 및 방법은 다음과 같습니다.
      1) 파기절차
      이용자가 회원가입 등을 위해 입력하신 정보는 목적이 달성된 후 별도의 DB로 옮겨져(종이의 경우 별도의 서류함) 내부 방침 및 기타 관련 법령에 의한 정보보호 사유에 따라(보유 및 이용기간 참조) 일정 기간 저장된 후 파기됩니다. 동 개인정보는 법률에 의한 경우가 아니고서는 다른 목적으로 이용되지 않습니다.
      2) 파기기준
      - 이용자 본인 혹은 법정대리인의 회원탈퇴 요청
      - 한국인터넷진흥원, 본인확인기관 등의 개인정보 관련기관을 통한 회원 탈퇴 요청
      - 개인정보 수집·이용 등에 대한 동의 철회 및 개인정보 삭제 또는 파기 요청
      - 정보통신망법에 따른 장기 미이용자
      3) 파기방법
      - 전자적 파일형태로 저장된 개인정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제
      - 종이에 출력된 개인정보는 분쇄기로 분쇄하거나 소각을 통하여 파기
      7. 회원 및 법정대리인의 권리와 그 행사방법
      이용자의 개인정보는 원칙적으로 개인정보 수집 및 이용목적이 달성된 후에는 해당 정보를 지체없이 파기합니다. 파기절차 및 방법은 다음과 같습니다.
      -회원 및 법정 대리인은 아래의 방법으로 언제든지 등록되어 있는 자신의 개인정보를 조회하거나 수정 및 삭제할 수 있으며 개인정보 제공동의를 철회하여 가입해지를 요청할 수도 있습니다. 혹은 회원 및 법정 대리인은 고객센터나 개인정보책임자에게 서면, 전화 또는 이메일로 개인정보의 조회, 수정, 삭제, 제공 동의 철회를 요청할 수 있습니다.
      -회원 혹은 법정대리인이 개인정보의 오류에 대한 정정을 요청하신 경우에는 정정을 완료하기 전까지 당해 개인정보를 이용 또는 제공하지 않습니다. 또한 잘못된 개인정보를 제3자에게 이미 제공한 경우에는 정정 처리결과를 제3자에게 지체없이 통지하여 정정이 이루어지도록 하겠습니다. ${companyName}는 회원 혹은 법정 대리인의 요청에 의해 해지 또는 삭제된 개인정보는 본 개인정보 처리방침에 명시된 바에 따라 처리하고 그 외의 용도로 열람 또는 이용할 수 없도록 처리하고 있습니다.
      8. 개인정보의 기술적/관리적 보호대책
      ${companyName}는 회원들의 개인정보를 처리함에 있어 개인정보가 분실, 도난, 누출, 변조 또는 훼손되지 않도록 안전성 확보를 위하여 다음과 같은 기술적/관리적 대책을 강구하고 있습니다.
      1) 비밀번호 암호화
      아이디의 비밀번호는 암호화되어 저장 및 관리되고 있어 본인만이 알고 있으며, 개인정보의 확인 및 변경도 비밀번호를 알고 있는 본인에 의해서만 가능합니다. 해당 암호화는  을 사용한 복수단편암호를 구현하여 해싱방식을 사용합니다.
      2) 해킹 등에 대비한 대책
      ${companyName} 해킹이나 컴퓨터 바이러스 등에 의해 이용자의 개인정보가 유출되거나 훼손되는 것을 막기 위해 최선을 다하고 있습니다. 개인정보의 훼손에 대비해서 자료를 수시로 백업하고 있고, 최신 보안솔루션을 이용하여 이용자들의 개인정보나 자료가 누출되거나 손상되지 않도록 방지하고 있으며, 암호화통신 등을 통하여 네트워크상에서 개인정보를 안전하게 전송할 수 있도록 하고 있습니다. 그리고 침입차단시스템을 이용하여 외부로부터의 무단 접근을 통제하고 있으며, 기타 시스템적으로 보안성을 확보하기 위한 가능한 모든 기술적 장치를 갖추려 노력하고 있습니다.
      3) 처리 직원의 최소화 및 교육
      ${companyName}의 개인정보관련 처리 직원은 담당자에 한정하며, 개인정보 상세 조회가 가능한 계정은 권한 분리 조치와 보안조치를 취하였습니다. 이 계정을 위한 별도의 비밀번호는 절차를 거쳐 정기적으로 갱신하고 있으며, 담당자에 대한 수시 교육을 통해 개인정보 처리방침의 준수를 항상 강조하고 있습니다.
      4) 개인정보보호전담기구의 운영
      사내 개인정보보호전담기구 등을 통해 개인정보 처리방침의 이행 및 담당자의 준수 여부를 확인하여 문제가 발견될 경우 즉시 수정하고 바로 잡을 수 있도록 노력하고 있습니다. 단, 회원 본인의 부주의나 인터넷상의 문제로 아이디, 비밀번호 등 개인정보가 유출되어 발생한 문제에 대해 ${companyName}는 일체의 책임을 지지 않습니다.
      9. 개인정보에 관한 민원서비스
      가)${companyName} 민원서비스
      ${companyName}는 회원의 개인정보를 보호하고 개인정보와 관련한 불만을 처리하기 위하여 아래와 같이 관련 부서 및 개인정보관리책임자를 지정하고 있습니다. ${companyName}는 접수하신 내용에 대해 신속하고 충분한 답변을 드리기 위해 노력하고 있습니다. 고객서비스 담당부서의 운영시간은 평일 오전 9시부터 오후 6시까지입니다.
      고객서비스 담당부서
      -부 서 : ${policy.customerService.department}
      -메 일 : ${policy.customerService.email}
      개인정보 보호담당자
      -이 름 : ${policy.privacyManager.name}
      -전 화 : ${policy.privacyManager.phone}
      -메 일 : ${policy.privacyManager.email}
      개인정보 보호책임자
      -이 름 : ${policy.privacyAuthority.name}
      -전 화 : ${policy.privacyAuthority.phone}
      -메 일 : ${policy.privacyAuthority.email}
      나) 기타 개인정보 관련 민원
      기타 개인정보침해에 대한 신고나 상담이 필요하신 경우에는 아래 기관에 문의하시기 바랍니다.
      - 한국인터넷진흥원 개인정보보호 ([https:
      - 개인정보분쟁조정위원회 ([hkopico.go.kr/](http:
      - 정보보호마크인증위원회 ([www.eprivacy.or.kr](http:
      - 대검찰청 인터넷범죄수사센터 ([http:
      - 경찰청 사이버안전국([ https:
      10. 기타
      ${companyName}에서의 설문조사나 이벤트 등의 행사시, 통계분석이나 경품제공 등을 위해 선별적으로 개인정보 입력을 요청할 수 있습니다. 그러나 회원의 기본적 인권 침해의 우려가 있는 민감한 개인정보(인종 및 민족, 출신지 및 본적지, 정치적 성향 및 범죄기록, 건강상태 및 성생활 등)는 수집하지 않으며 부득이하게 수집해야 할 경우 회원들의 사전동의를 반드시 구할 것입니다. 그리고, 어떤 경우에라도 입력하신 정보를 회원들에게 사전에 밝힌 목적 이외에 다른 목적으로는 사용하지 않으며 외부로 유출하지 않습니다.
      ${companyName}가 제공하는 서비스 내에 광고를 게재하는 광고주나 검색 등의 각종 디렉토리 또는 게시판에 링크되어 있는 웹사이트들이 이용자의 개인정보를 수집할 수도 있을 것입니다. 또한 서비스 내에 링크되어 있는 기타 웹사이트들이 개인정보를 수집하는 행위에 대해서는 본 개인정보 처리방침이 적용되지 않음을 알려 드립니다.
      11. 개인정보 처리방침 변경
      1. 이 개인정보 처리방침은 ${startDateStr}부터 적용됩니다.
      가) 필수수집 항목 : 이름, 아이디(이메일주소), 전화번호, 사진, 주소록, 카메라, 비밀번호, 닉네임, 생년월일, 성별, , 휴대폰 번호, 사진, 마케팅 수신 동의여부, 위치정보(지역)
      나) 선택수집 항목 : 전공, 직장, 학교, 직업,
      다)  병역사항, 연봉, 차량, 주거형태, 몸무게, 시력, 혼인이력, 연애상태 등은 추가서비스 및 설문조사를 통해 다양한 정보 수집 및 제공에 필요시 정보주체가 그 수집에 동의하는 경우 추가로 수집될 수 있습니다.</p>`.replace(
      /\n/g,
      "</p><p>"
    );
  return <HtmlContent className={className} content={content} />;
};

const PrivacyPolicyEn = ({
  className,
  companyName,
  policy = {
    company: {
      ceo: "My Name",
      address: "My Address",
      phone: "010-8888-8888",
    },
    customerService: {
      department: "My Department",
      email: "my-email@my-domain.com",
    },
    privacyManager: {
      name: "My Name",
      phone: "010-8888-8888",
      email: "my-email@my-domain.com",
    },
    privacyAuthority: {
      name: "My Name",
      phone: "010-8888-8888",
      email: "my-email@my-domain.com",
    },
    locationAuthority: {
      name: "My Name",
      email: "my-email@my-domain.com",
    },
  },
  startDateStr = "January 1, 2023",
}: PrivacyPolicyProps) => {
  const content =
    `<p>${companyName} values your personal information. ${companyName} complies with personal information protection regulations and guidelines under relevant laws, including the 「Act on Promotion of Information and Communications Network Utilization and Information Protection」, and has established a personal information processing policy in accordance with relevant laws to do our best to protect users' rights and interests.

    ${companyName} Privacy Policy
    ${companyName} (hereinafter referred to as "Company") collects, uses, and provides personal information with the consent of users. We also actively guarantee users' right to self-determination of personal information. ${companyName} guides you through our privacy policy on the types of personal information we collect, purposes of use, processing policies, etc., and informs you of what measures are being taken to protect personal information so that users can use our services with confidence according to their guaranteed rights.

    The Company collects or uses customers' personal information necessary to provide smooth services and provide better customer experiences. To provide basic functions of services or various specialized functions according to the terms of service agreed by customers, it may be necessary to verify customers' email or SNS accounts, birth year, gender, devices used, etc. It is also necessary when there are matters to be individually notified to customers regarding personal information, when there are inquiries or disputes related to service use, and for purchasing jellies and payment when using paid services.

    In addition, your personal information is necessary for developing new services and improving functions, providing customized services and advertising, providing various events and promotional information and participation opportunities, fulfilling obligations stipulated in laws and regulations, and preventing and blocking wrong usage behaviors that may harm customers contrary to laws or terms of service.

    1. Items and Methods of Personal Information Collection
    1) Items of Personal Information Collected
    a. Information Collected During Membership Registration
    For ${companyName} membership registration, smooth customer consultation, and provision of various services, we collect the following personal information during membership registration. Optional collection items can be left blank during membership registration.
    - Required collection items: Name, email address, phone number, photo, address book, password, nickname, date of birth, gender, mobile phone number, marketing consent status, location information (region)
    - Optional collection items: Major, workplace, school, occupation
    - Additional information such as salary, vehicle, housing type, weight, vision, marital history, relationship status, etc. may be additionally collected if the data subject consents to such collection when necessary for providing additional services and conducting surveys.

    b. Information Collected During Service Use or Business Processing
    - IP Address, visit date and time, service usage records, inappropriate usage records, access logs
    - Geographic location of your mobile device when using the service
    - Mobile device information, country information (MCC)
    - Advertising identifier information (ADID, IDFA)

    c. Information Collected When Using Customer Center or Participating in Events
    When using the customer center or participating in events, additional personal information not collected during membership registration may be collected for complaint handling, prize delivery, and tax reporting. There may be additional personal information collected depending on the type beyond the items below. During this process, we provide information about collection and obtain separate consent.
    - Customer Center: Phone number, email address, real name change information, etc.
    - Event participation and winning: Name, phone number, email address, delivery address, resident registration number*
    ▶ Resident registration number collection: Only when it must be collected according to relevant laws for processing tax and public charges for winners, and separate consent is obtained upon collection.

    2) Personal Information Collection Methods
    The Company collects personal information through the following methods:
    - Consenting to personal information collection during membership registration and service use and directly entering information
    - Website, mobile app, mobile web, written forms, telephone, FAX, inquiry email, SNS, bulletin boards
    - Event participation, delivery requests
    - Collection through generated information collection tools
    - Information collection through joint partnerships and cooperation with partner companies

    2. Purpose of Personal Information Collection and Use
    The Company processes personal information for the following purposes. The personal information being processed will not be used for purposes other than the following, and if the purpose of use changes, we will implement necessary measures such as obtaining separate consent in accordance with Article 18 of the Personal Information Protection Act.

    1) Contract fulfillment for service provision, additional service provision, and member management
    Matching service and content provision, identity verification for membership service use, personal identification, membership intention confirmation, age verification, membership registration and registration limit, unique user identification for additional service provision, prevention of inappropriate use and unauthorized use by problematic members, prevention of re-registration within 24 hours after membership withdrawal, complaint handling and other civil complaint processing, record preservation for dispute resolution, delivery of notices, confirmation of membership withdrawal intention

    2) Event management
    Event participation, winner confirmation and related notices, prize delivery, related complaint handling, tax reporting

    3) Marketing and advertising utilization
    New service (product) development and specialization, delivery of promotional information such as events, service provision and advertisement placement according to demographic characteristics, access frequency analysis or statistics on members' service use, service effectiveness verification

    4) Use of collected personal information and provision to third parties
    The Company may provide personal information provided by users to third parties in a form that cannot identify users if necessary for statistical compilation, academic research, or market research.

    3. Personal Information Retention and Use Period
    Information collected during membership registration and service use is preserved for 3 months until membership withdrawal or until the purpose of personal information collection and use is achieved, and thereafter such information is destroyed without delay. However, for the following information, such information is preserved for the specified period even after membership withdrawal for the following reasons.

    1) Reasons for information retention according to company internal policy
    a. Inappropriate use records
    - Preservation items: Inappropriate use records (inappropriate registration, regulation violation records, etc.)
    - Preservation reason: Prevention of inappropriate registration and inappropriate use
    - Preservation period: 3 years

    b. Information for preventing repeated withdrawal/re-registration
    When a member withdraws, member information is kept for 3 months after member withdrawal to block such actions for the purpose of preventing inappropriate use of services provided by ${companyName} and illegally obtaining benefits such as event benefits through repeated re-registration, arbitrary cancellation, etc., or concerns about identity theft in this process.
    - Preservation items: ID (email address), password, mobile phone number, device information
    - Preservation reason: Prevention of inappropriate use such as re-registration, arbitrary cancellation
    - Preservation period: 3 months

    c. Information for separate storage of personal information and restoration of dormant accounts according to introduction of personal information validity period system
    Personal information included in member information of users who do not use the service for a long period is separately stored. If you want to use the service again, you can restore to a normal ID through dormant account restoration processing.
    - Separate storage items: Personal information included in member information (including required and optional information)
    ▶ Separate storage criteria: Conversion to dormant account and separate storage of personal information if not logged in within 1 year from the reference point
    ▶ Separate storage exclusions: Information necessary for dormant notification and restoration, information that needs to be preserved according to legal regulations and internal regulations
    - Separate storage reason: Long-term non-user personal information protection according to 「Act on Promotion of Information and Communications Network Utilization and Information Protection」
    - Separate storage period: 3 years after dormant account conversion

    2) Reasons for information retention according to relevant laws
    When it is necessary to preserve according to regulations of relevant laws such as 「Consumer Protection Act in Electronic Commerce」, ${companyName} keeps member information for a certain period specified in relevant laws. In this case, ${companyName} uses the stored information only for the purpose of storage, and the preservation periods are as follows:
    - Service use records, access logs, access IP information: 3 months (Communications Privacy Protection Act)
    - Records related to indication/advertising: 6 months (Consumer Protection Act in Electronic Commerce)
    - Records related to contracts or withdrawal of subscription: 5 years (Consumer Protection Act in Electronic Commerce)
    - Records related to payment and supply of goods: 5 years (Consumer Protection Act in Electronic Commerce)
    - Records related to consumer complaints or dispute resolution: 3 years (Consumer Protection Act in Electronic Commerce)
    - However, according to internal policy to prevent disputes due to inappropriate use of services, inappropriate use records of services are preserved for 1 year and then destroyed.

    4. Personal Information Processing Consignment
    Except when customers separately consent during service use or in cases stipulated by law, we do not use customers' personal information beyond the purpose scope mentioned above or provide or share it with third parties. However, for service improvement, blocking and preventing wrong usage behaviors that may harm other customers contrary to laws or terms of service, and stable personal information handling, customers' personal information may be consigned to external parties for processing. Please refer to the following for consigned processing institutions and consigned work content.

    1) Account information processing consignment
    - Consigned information: Account information
    - Consignee: Amazon Web Service Inc.
    - Personal information retention and use period: Until membership withdrawal or consignment contract termination (However, for inappropriate use records or information with legal preservation obligations, consignment until the retention period of such information)

    2) Notification processing consignment
    - Consigned information: KakaoTalk notification delivery
    - Personal information retention and use period: When KakaoTalk use is discontinued or notification reception is refused

    3) Email transmission consignment
    - Consigned information: Email transmission
    - Personal information retention and use period: Until membership withdrawal or consignment contract termination

    4) Text message transmission consignment
    - Consigned information: Text message transmission
    - Personal information retention and use period: Until membership withdrawal or consignment contract termination

    5. Personal Information Disclosure and Integration
    ${companyName} does not use users' personal information beyond the scope of use or disclose it externally under any circumstances except when users consent or as stipulated by law. When sharing users' personal information with external parties, we go through procedures to inform and obtain consent in advance, and without users' consent, we do not arbitrarily collect or share additional information. However, the following cases are exceptions:

    1) When users consent
    - When users have disclosed in advance
    - When users consent to integration
    ▶ We notify in advance that information may be provided when participating in events. Events and winnings may be canceled for inaccurate personal information or missing personal information.

    2) When there are requests according to legitimate procedures under legal regulations
    - When there are requests from investigative agencies according to procedures and methods specified in laws for investigation purposes under legal regulations
    - When there are requests from related agencies according to procedures and methods specified in laws for purposes such as dispute resolution under legal regulations
    - Other cases under legal regulations

    3) Others
    - When necessary for fee settlement according to service provision
    - When providing in a form that cannot identify individuals for statistical compilation, academic research, or market research
    - When the data subject or legal representative is unable to express intention or prior consent cannot be obtained due to unknown address, etc., and it is clearly recognized as necessary for urgent life, body, and property interests of the data subject or third parties

    6. Personal Information Destruction Procedures and Methods
    Users' personal information is destroyed without delay in principle after the purpose of personal information collection and use is achieved. Destruction procedures and methods are as follows:

    1) Destruction procedures
    Information entered by users for membership registration, etc. is transferred to a separate DB after the purpose is achieved (separate document box for paper) and stored for a certain period according to internal policy and information protection reasons under other relevant laws (refer to retention and use period) before destruction. Such personal information is not used for other purposes unless required by law.

    2) Destruction criteria
    - Member withdrawal request by the user or legal representative
    - Member withdrawal request through personal information related organizations such as Korea Internet & Security Agency, identity verification organizations
    - Withdrawal of consent for personal information collection and use and request for personal information deletion or destruction
    - Long-term non-users according to Information and Communications Network Act

    3) Destruction methods
    - Personal information stored in electronic file format is deleted using technical methods that cannot reproduce records
    - Personal information printed on paper is destroyed by shredding with a shredder or incineration

    7. Rights of Members and Legal Representatives and Exercise Methods
    Users' personal information is destroyed without delay in principle after the purpose of personal information collection and use is achieved. Destruction procedures and methods are as follows:
    - Members and legal representatives can inquire, modify, and delete their registered personal information at any time through the following methods and may also request membership withdrawal by withdrawing consent to personal information provision. Or members and legal representatives can request inquiry, modification, deletion, and withdrawal of consent to provision of personal information by writing, telephone, or email to customer service or the personal information manager.
    - When members or legal representatives request correction of errors in personal information, we do not use or provide such personal information until correction is completed. Also, if incorrect personal information has already been provided to third parties, we notify third parties of correction processing results without delay to ensure correction is made. ${companyName} processes personal information canceled or deleted at the request of members or legal representatives according to what is specified in this personal information processing policy and processes it so it cannot be viewed or used for other purposes.

    8. Technical/Administrative Protection Measures for Personal Information
    ${companyName} implements the following technical/administrative measures to ensure safety so that personal information is not lost, stolen, leaked, altered, or damaged when processing members' personal information.

    1) Password encryption
    ID passwords are encrypted and stored and managed, known only by the individual, and personal information verification and changes are possible only by the individual who knows the password. The encryption implements multiple fragment encryption using hashing methods.

    2) Measures against hacking, etc.
    ${companyName} does its best to prevent users' personal information from being leaked or damaged by hacking or computer viruses. We regularly back up data in preparation for personal information damage, use the latest security solutions to prevent users' personal information or data from being leaked or damaged, and enable safe transmission of personal information over networks through encrypted communication. We also control unauthorized access from outside using intrusion prevention systems and strive to have all possible technical devices to ensure system security.

    3) Minimization and education of processing staff
    ${companyName}'s personal information related processing staff is limited to personnel in charge, and accounts capable of detailed personal information inquiry have been subject to authority separation measures and security measures. Separate passwords for these accounts are regularly updated through procedures, and compliance with personal information processing policies is always emphasized through frequent education of personnel in charge.

    4) Operation of personal information protection dedicated organization
    Through internal personal information protection dedicated organizations, we check implementation of personal information processing policies and compliance by personnel in charge to immediately correct and rectify when problems are discovered. However, ${companyName} takes no responsibility for problems arising from leakage of personal information such as IDs and passwords due to members' carelessness or internet problems.

    9. Civil Complaint Service Related to Personal Information
    a) ${companyName} civil complaint service
    ${companyName} designates relevant departments and personal information management managers as follows to protect members' personal information and handle complaints related to personal information. ${companyName} strives to provide prompt and sufficient responses to received content. Customer service department operating hours are weekdays from 9 AM to 6 PM.

    Customer Service Department
    - Department: ${policy.customerService.department}
    - Email: ${policy.customerService.email}

    Personal Information Protection Manager
    - Name: ${policy.privacyManager.name}
    - Phone: ${policy.privacyManager.phone}
    - Email: ${policy.privacyManager.email}

    Personal Information Protection Officer
    - Name: ${policy.privacyAuthority.name}
    - Phone: ${policy.privacyAuthority.phone}
    - Email: ${policy.privacyAuthority.email}

    b) Other personal information related civil complaints
    For other reports or consultations regarding personal information infringement, please contact the following organizations:
    - Korea Internet & Security Agency Personal Information Protection (https:
    - Personal Information Dispute Mediation Committee (hkopico.go.kr/ 1833-6972)
    - Privacy Mark Certification Committee (www.eprivacy.or.kr / 02-580-0533~4)
    - Supreme Prosecutors' Office Internet Crime Investigation Center (http:
    - National Police Agency Cyber Safety Bureau (https:

    10. Others
    During surveys or events at ${companyName}, selective personal information input may be requested for statistical analysis or prize provision. However, we do not collect sensitive personal information (race and ethnicity, origin and place of birth, political inclinations and criminal records, health status and sexual life, etc.) that may infringe on members' basic human rights, and if it must be collected unavoidably, we will definitely obtain prior consent from members. And under no circumstances do we use entered information for purposes other than those previously disclosed to members or leak it externally.

    Advertisers who place advertisements within services provided by ${companyName} or websites linked to various directories such as search or bulletin boards may collect users' personal information. Please note that this personal information processing policy does not apply to the collection of personal information by other websites linked within the service.

    11. Changes to Personal Information Processing Policy
    1. This personal information processing policy applies from ${startDateStr}.
    a) Required collection items: Name, ID (email address), phone number, photo, address book, camera, password, nickname, date of birth, gender, mobile phone number, photo, marketing consent status, location information (region)
    b) Optional collection items: Major, workplace, school, occupation
    c) Military service status, salary, vehicle, housing type, weight, vision, marital history, relationship status, etc. may be additionally collected if the data subject consents to such collection when necessary for providing additional services and conducting surveys.</p>`.replace(
      /\n/g,
      "</p><p>"
    );
  return <HtmlContent className={className} content={content} />;
};
