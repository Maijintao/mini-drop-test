#pragma once

namespace drop {

// 守护化：fork() → 父退出 → setsid() → 再 fork() → 关闭标准 fd
// 返回 0 成功，-1 失败
int Daemonize();

}  // namespace drop
