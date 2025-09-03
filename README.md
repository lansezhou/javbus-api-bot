# 本项目根据https://github.com/wensley/javbus-api-bot项目改编的，代码通过ai优化重构

# javbus-api-bot
[NSFW]一个查番号的电报机器人

### 部署与使用指南：javbus-api-bot
自己fork项目文件构建镜像使用
javbus-api：部署参考https://github.com/ovnrain/javbus-api

# 功能介绍

这个 Telegram 机器人主要功能包括：

- `/c [番号]`：查询影片详细信息、磁力链接及样品截图  
- `/latest`：获取最新的 15 个影片  
- `/stars [女优名]`：根据女优名字搜索影片，显示按钮列表，点击显示封面、详情及磁力链接  
- `/help`：查看命令帮助  

机器人仅允许指定的 Telegram 用户 ID 使用，通过 `TG_ID` 环境变量控制访问权限。

# 环境变量设置

| 变量名        | 示例值                                   |
|---------------|----------------------------------------|
| TG_BOT_TOKEN  | 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11 |
| API_BASE_URL  | https://api.example.com                 |
| TG_ID         | 123456789                               |



#### Bot命令添加使用指南

进入自己bot设置修改命令，然后发送下面的就可以设置

help - 查看可用命令
c - 番号搜索
latest - 获取最新影片
stars - [女优名]获取女优影片和磁链

