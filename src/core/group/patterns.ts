/**
 * 地区识别正则表
 *
 * 覆盖 20+ 常见地区，参考机场常见命名规律（中英文、缩写、城市名）。
 */

export interface CountryPattern {
    /** ISO 3166-1 alpha-2，如 'HK' */
    code: string;
    /** 国旗 emoji，如 '🇭🇰' */
    emoji: string;
    /** 中文名，如 '香港' */
    name: string;
    /** 匹配正则 */
    regex: RegExp;
}

/**
 * 缩写边界正则说明：
 * - `\bXX\b` 要求左右均为非单词字符，防止字母缩写在长单词中误匹配
 *   如 `US` 不应匹配 `Russia`（含 `us`），`IN` 不应匹配 `Philippines`（含 `in`）
 * - `GB` / `CA` 等还需排除前置数字，如 `100GB`，通过 `(?<!\d)\bGB\b` 实现
 */
export const COUNTRY_PATTERNS: CountryPattern[] = [
    {
        code: 'HK',
        emoji: '🇭🇰',
        name: '香港',
        regex: /香港|港(?!利|币|元|股|交|铁|剧)|\bHK\b|HongKong|Hong\s*Kong/i,
    },
    {
        code: 'JP',
        emoji: '🇯🇵',
        name: '日本',
        regex: /日本|东京|大阪|名古屋|福冈|\bJP\b|\bJapan\b|\bTokyo\b|\bOsaka\b|\bNagoya\b|\bFukuoka\b/i,
    },
    {
        code: 'US',
        emoji: '🇺🇸',
        name: '美国',
        regex: /美国|美(?!元|联储|颜|女|容)|洛杉矶|纽约|硅谷|西雅图|芝加哥|达拉斯|弗吉尼亚|\bUS\b|United\s*States|\bAmerica\b|Los\s*Angeles|New\s*York|Silicon\s*Valley|\bSeattle\b|\bChicago\b|\bDallas\b|\bVirginia\b/i,
    },
    {
        code: 'SG',
        emoji: '🇸🇬',
        name: '新加坡',
        regex: /新加坡|狮城|\bSG\b|\bSingapore\b/i,
    },
    {
        code: 'TW',
        emoji: '🇹🇼',
        name: '台湾',
        regex: /台湾|台灣|台(?!风|币|电|北(?!京)|积|历)|\bTW\b|\bTaiwan\b/i,
    },
    {
        code: 'KR',
        emoji: '🇰🇷',
        name: '韩国',
        regex: /韩国|韓國|首尔|首爾|\bKR\b|\bKorea\b|\bSeoul\b/i,
    },
    {
        code: 'DE',
        emoji: '🇩🇪',
        name: '德国',
        regex: /德国|德國|法兰克福|\bDE\b|\bGermany\b|\bFrankfurt\b/i,
    },
    {
        code: 'GB',
        emoji: '🇬🇧',
        name: '英国',
        // GB 需要排除前面是数字的情况（如 100GB），使用 (?<!\d) 实现
        regex: /英国|英國|伦敦|(?<!\d)\bGB\b|\bUK\b|United\s*Kingdom|\bBritain\b|\bLondon\b/i,
    },
    {
        code: 'FR',
        emoji: '🇫🇷',
        name: '法国',
        regex: /法国|法國|巴黎|\bFR\b|\bFrance\b|\bParis\b/i,
    },
    {
        code: 'NL',
        emoji: '🇳🇱',
        name: '荷兰',
        regex: /荷兰|荷蘭|阿姆斯特丹|\bNL\b|\bNetherlands\b|\bAmsterdam\b/i,
    },
    {
        code: 'RU',
        emoji: '🇷🇺',
        name: '俄罗斯',
        regex: /俄罗斯|俄羅斯|俄国|莫斯科|\bRU\b|\bRussia\b|\bMoscow\b/i,
    },
    {
        code: 'AU',
        emoji: '🇦🇺',
        name: '澳大利亚',
        regex: /澳大利亚|澳大利亞|澳洲|悉尼|墨尔本|\bAU\b|\bAustralia\b|\bSydney\b|\bMelbourne\b/i,
    },
    {
        code: 'CA',
        emoji: '🇨🇦',
        name: '加拿大',
        regex: /加拿大|多伦多|温哥华|\bCA\b|\bCanada\b|\bToronto\b|\bVancouver\b/i,
    },
    {
        code: 'IN',
        emoji: '🇮🇳',
        name: '印度',
        // 排除"印度尼西亚"，英文词要求整词匹配，防止 `in` 子串误匹配
        regex: /印度(?!尼)|孟买|\bIN\b|\bIndia\b|\bMumbai\b|\bChennai\b|\bBangalore\b/i,
    },
    {
        code: 'TR',
        emoji: '🇹🇷',
        name: '土耳其',
        regex: /土耳其|伊斯坦布尔|\bTR\b|\bTurkey\b|\bTurkiye\b|\bIstanbul\b/i,
    },
    {
        code: 'AR',
        emoji: '🇦🇷',
        name: '阿根廷',
        regex: /阿根廷|布宜诺斯艾利斯|\bAR\b|\bArgentina\b|Buenos\s*Aires/i,
    },
    {
        code: 'BR',
        emoji: '🇧🇷',
        name: '巴西',
        regex: /巴西|圣保罗|\bBR\b|\bBrazil\b|Sao\s*Paulo/i,
    },
    {
        code: 'MX',
        emoji: '🇲🇽',
        name: '墨西哥',
        regex: /墨西哥|\bMX\b|\bMexico\b/i,
    },
    {
        code: 'PH',
        emoji: '🇵🇭',
        name: '菲律宾',
        regex: /菲律宾|菲律賓|马尼拉|\bPH\b|\bPhilippines\b|\bManila\b/i,
    },
    {
        code: 'ID',
        emoji: '🇮🇩',
        name: '印度尼西亚',
        regex: /印度尼西亚|印尼|雅加达|\bID\b|\bIndonesia\b|\bJakarta\b/i,
    },
    {
        code: 'TH',
        emoji: '🇹🇭',
        name: '泰国',
        regex: /泰国|泰國|曼谷|\bTH\b|\bThailand\b|\bBangkok\b/i,
    },
    {
        code: 'VN',
        emoji: '🇻🇳',
        name: '越南',
        regex: /越南|河内|胡志明|\bVN\b|\bVietnam\b|\bHanoi\b|Ho\s*Chi\s*Minh/i,
    },
    {
        code: 'MY',
        emoji: '🇲🇾',
        name: '马来西亚',
        regex: /马来西亚|馬來西亞|马来(?!群岛)|吉隆坡|\bMY\b|\bMalaysia\b|Kuala\s*Lumpur/i,
    },
];
