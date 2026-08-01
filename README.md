# Sudoku Generator

一个可直接游玩的数独生成网站。Spring Boot 后端使用 Java 算法实时生成题目并验证唯一解，原生 HTML、CSS 和 JavaScript 前端负责难度选择、手动求解和游戏状态。项目不需要数据库。

## 主要功能

- `Easy`、`Medium`、`Hard` 三种难度，分别通过保留 40、32、26 个提示数字区分。
- Java 随机回溯生成完整数独，挖空时逐步检查题目只有一个解。
- 可填写的数独棋盘，支持屏幕数字键盘和电脑键盘。
- 冲突提示、进度检查、每题最多 3 次提示、重置、计时和完成统计。
- 可临时查看完整答案，隐藏答案后恢复玩家此前填写的内容。
- Spring Boot 同时提供静态网页、CSS、JavaScript、数独 API 和健康检查 API。

## 使用技术

- Java 21（Maven 编译目标）
- Spring Boot 4.1.0
- Maven 3.9.11 Wrapper
- 原生 HTML、CSS、JavaScript
- JUnit 5、Spring MockMvc 和 Node.js 测试

## 项目结构

```text
.
├── .mvn/wrapper/                         Maven Wrapper 配置
├── src/main/java/com/example/sudoku/    Spring Boot、API、生成与求解算法
├── src/main/resources/static/           HTML、CSS、JavaScript 静态资源
├── src/test/java/com/example/sudoku/    启动、页面、API 与唯一解测试
├── src/test/js/                          前端逻辑与浏览器烟雾测试
├── mvnw / mvnw.cmd                       Linux/macOS 与 Windows Wrapper
└── pom.xml                               Maven 项目配置
```

根目录中的 `Main.java`、`heuristic.java` 和 `SudokuGenerator.java` 是保留的原控制台代码，只作为算法来源参考，不在 Maven 的 `src/main/java` 下，因此不会参与网站构建。

## 本地启动

需要安装 JDK 21 或更高版本。项目自带 Maven Wrapper，不需要另外安装 Maven；第一次执行时 Wrapper 会下载指定版本。

Windows PowerShell：

```powershell
.\mvnw.cmd spring-boot:run
```

Linux 或 macOS：

```bash
./mvnw spring-boot:run
```

本地未设置 `PORT` 时使用 `8080`。如需指定其他端口：

```powershell
$env:PORT=9090
.\mvnw.cmd spring-boot:run
```

```bash
PORT=9090 ./mvnw spring-boot:run
```

启动后打开 <http://localhost:8080>。如果修改了端口，请相应替换网址中的 `8080`。

## 手动求解

进入题目页后，点击空格，再使用页面上的 `1`–`9`、`Erase`，或电脑键盘输入。`Backspace` 和 `Delete` 可以删除数字，方向键可以移动选中格。

- `Check Progress`：标记当前填写的正确和错误数字，并显示剩余空格数。
- `Hint`：填写一个正确数字，每道题最多使用 3 次。
- `Reset Puzzle`：确认后清除玩家填写，保留 Java 生成的固定数字。
- `Show Solution`：确认后暂停计时并临时显示答案；再次点击会恢复玩家填写。
- `Generate Again`：向 Java 后端请求同一难度的新题，并重置计时、提示和游戏状态。
- 页面左上角 `Back` 按实际浏览历史返回；页面中的 `Back to Home` 始终返回首页。

## 测试与生产构建

运行 Spring Boot、API、数据完整性和唯一解测试：

```powershell
.\mvnw.cmd test
```

Linux 或 macOS 使用 `./mvnw test`。

安装 Node.js 后可以运行不依赖第三方包的前端逻辑测试：

```powershell
node --test src\test\js\sudoku-game.test.js
```

浏览器烟雾测试需要先启动网站，并让 Chrome、Edge 或 Chromium 位于 `PATH`。也可以通过 `CHROME_PATH` 指定浏览器，通过 `SUDOKU_BASE_URL` 指定正在测试的网站根地址：

```powershell
node src\test\js\browser-smoke.js
node src\test\js\mobile-browser-smoke.js
```

生产构建和运行：

```powershell
.\mvnw.cmd clean package
java -jar target\sudoku-generator-0.0.1-SNAPSHOT.jar
```

Linux 或 macOS 将路径分隔符改为 `/`：

```bash
./mvnw clean package
java -jar target/sudoku-generator-0.0.1-SNAPSHOT.jar
```

## API 说明

### 健康检查

`GET /api/health`

正常响应：

```json
{
  "status": "UP"
}
```

### 生成数独

`GET /api/sudoku/generate?difficulty=Easy`

`difficulty` 支持 `Easy`、`Medium`、`Hard`，大小写不敏感。未传时默认为 `Medium`。

响应字段：

- `difficulty`：规范化后的难度名称。
- `puzzle`：9×9 题目数组，`0` 表示玩家需要填写的空格。
- `solution`：9×9 完整唯一解。
- `responseTimeMs`：Java 后端实际测量的本次生成耗时，单位为毫秒。

示例地址：<http://localhost:8080/api/sudoku/generate?difficulty=Easy>

## Railway 部署

Railway 的 Railpack 能通过根目录的 `pom.xml` 自动识别 Java/Maven 项目，当前 Java 构建环境默认使用 JDK 21，因此本项目不需要 Dockerfile、`railway.json` 或自定义构建命令。应用通过 `server.port=${PORT:8080}` 读取 Railway 自动提供的 `PORT`，并监听所有网络接口。

1. 将代码提交到自己的 GitHub 仓库。不要提交 `.env`、私钥、日志或 `target`；这些内容已经加入 `.gitignore`。
2. 在 Railway 新建项目，选择 **Deploy from GitHub repo**，授权并选择该仓库。
3. 等待 Railway 自动识别 Java、构建 Maven 项目并启动应用。
4. 在服务的 **Settings → Networking** 中选择 **Generate Domain**，获得公开网址。
5. 可在服务设置中将健康检查路径设为 `/api/health`。
6. 部署后访问生成的域名，并检查 `/api/health` 和 `/api/sudoku/generate?difficulty=Easy`。

只有自动识别失败时，才需要在 Railway 服务设置中手动填写构建或启动命令。相关官方说明：[Spring Boot 部署指南](https://docs.railway.com/guides/spring-boot)、[Railpack Java 识别与版本](https://railpack.com/languages/java/)、[Railpack 自动构建](https://docs.railway.com/builds/railpack)、[公网与 PORT](https://docs.railway.com/public-networking)。
