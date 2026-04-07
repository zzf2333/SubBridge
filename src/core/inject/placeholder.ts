/**
 * 占位符常量定义
 *
 * 三种占位符类型：
 *
 * 1. 对象占位符（出现在 outbounds 数组中，替换为多个对象）
 *    在 JSON 中表示为 { "$subbridge": "nodes" } 或 { "$subbridge": "country_groups" }
 *
 * 2. 字符串占位符 "$nodes"（出现在 outbounds tag 字符串数组中）
 *    展开为所有节点 tag 列表
 *
 * 3. 字符串占位符 "$nodes:<CODE>"（如 "$nodes:HK"）
 *    展开为指定国家的节点 tag 列表
 */

/** 对象占位符的 key，如 { "$subbridge": "nodes" } */
export const SUBBRIDGE_KEY = '$subbridge';

/** 对象占位符：展开为所有节点 outbound 对象 */
export const PLACEHOLDER_NODES = 'nodes';

/** 对象占位符：展开为所有国家 selector + urltest 对 */
export const PLACEHOLDER_COUNTRY_GROUPS = 'country_groups';

/** 字符串占位符：展开为所有节点 tag 列表 */
export const PREFIX_NODES = '$nodes';

/** 字符串占位符前缀：展开为指定国家节点 tag 列表，如 "$nodes:HK" */
export const PREFIX_NODES_COUNTRY = '$nodes:';
