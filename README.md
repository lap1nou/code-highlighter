```pwsh
wget -UseBasicParsing "https://github.com/lap1nou/code-highlighter/archive/refs/heads/main.zip" -OutFile "code-highlighter.zip"
Expand-Archive "code-highlighter.zip" -DestinationPath "code-highlighter"
mv ".\code-highlighter\code-highlighter-main\*" ".\code-highlighter\"
rm -Recurse ".\code-highlighter\code-highlighter-main\"
wget -UseBasicParsing "https://github.com/highlightjs/cdn-release/archive/refs/tags/11.12.0.zip" -OutFile "11.12.0.zip"
Expand-Archive "11.12.0.zip"
Copy-Item -Path "11.12.0\cdn-release-11.12.0\build\*" -Destination "code-highlighter\vendor\highlight\" -Recurse -Force
rm -Recurse "11.12.0"
rm -Recurse "11.12.0.zip"
rm -Recurse "code-highlighter.zip"
```
