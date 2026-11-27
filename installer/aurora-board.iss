; ============================================================================
; Instalador do Aurora Board (Inno Setup 6). Monta com: npm run installer
;
; Mesmo desenho do Aurora Whisper (ADR-018 daquele projeto):
;   - por usuário, sem administrador (PrivilegesRequired=lowest);
;   - o programa em %LOCALAPPDATA%\Programs\Aurora Board\ ;
;   - os dados (os quadros, no perfil do WebView2) em %LOCALAPPDATA%\AuroraBoard\ ;
;   - desinstalar pergunta se apaga os dados, e o padrão é NÃO apagar.
; Nenhuma conexão de rede: o WebView2 já vem no Windows 11; se faltar, o instalador só avisa.
; ============================================================================

#ifndef VersaoDoApp
  #define VersaoDoApp "0.0.0-dev"
#endif
#ifndef VersaoNumerica
  #define VersaoNumerica "0.0.0.0"
#endif
#ifndef PastaDoBuild
  #define PastaDoBuild "..\release\app"
#endif
#ifndef PastaSaida
  #define PastaSaida "..\release"
#endif

#define NomeDoApp "Aurora Board"
#define NomeDoExe "AuroraBoard.exe"
#define MutexDoApp "Local\AuroraBoard.Instancia"
#define PastaDeDados "AuroraBoard"
; O cliente do WebView2 Runtime no EdgeUpdate (o mesmo id em todas as instalações).
#define ClienteWebView2 "{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"

[Setup]
AppId={{12070659-D0DE-4351-80AB-6BA2AA9488A5}
AppName={#NomeDoApp}
AppVersion={#VersaoDoApp}
AppVerName={#NomeDoApp} {#VersaoDoApp}
AppPublisher=Mauro Juliani Junior
AppPublisherURL=https://github.com/MauroJulianiJunior/aurora-board
VersionInfoVersion={#VersaoNumerica}
VersionInfoProductVersion={#VersaoNumerica}
VersionInfoDescription={#NomeDoApp} - instalador
PrivilegesRequired=lowest
DefaultDirName={localappdata}\Programs\{#NomeDoApp}
DefaultGroupName={#NomeDoApp}
DisableProgramGroupPage=yes
DisableDirPage=auto
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#PastaSaida}
OutputBaseFilename=AuroraBoard-Setup-{#VersaoDoApp}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no
SetupIconFile=..\build\icone\aurora-board.ico
UninstallDisplayIcon={app}\{#NomeDoExe}
UninstallDisplayName={#NomeDoApp}
AppMutex={#MutexDoApp}
SetupMutex=AuroraBoardSetup
CloseApplications=no

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
; Marcado por padrão: a ideia é abrir a lousa direto, com um clique duplo.
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#PastaDoBuild}\{#NomeDoExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}\licencas"; DestName: "LICENSE.txt"; Flags: ignoreversion
Source: "..\THIRD_PARTY_NOTICES.md"; DestDir: "{app}\licencas"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#NomeDoApp}"; Filename: "{app}\{#NomeDoExe}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#NomeDoApp}"; Filename: "{app}\{#NomeDoExe}"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#NomeDoExe}"; Description: "{cm:AbrirAgora}"; Flags: nowait postinstall skipifsilent

[CustomMessages]
AbrirAgora=Abrir o Aurora Board agora
SemWebView2=O Aurora Board abre a lousa com o Microsoft Edge WebView2 Runtime, que vem com o Windows 11, mas ele não foi encontrado nesta máquina.%n%nA instalação continua. Se o Aurora Board não abrir, instale o "WebView2 Runtime" pelo site da Microsoft e abra de novo.
PerguntaApagarDados=Apagar também os quadros do Aurora Board deste usuário?%n%nIsso apaga todos os quadros e preferências guardados em %1. Não dá para desfazer.%n%nSe você só vai atualizar ou reinstalar, escolha Não: os quadros ficam. Para guardar uma cópia, abra o Aurora Board antes e use Quadros > Exportar todos (backup).
NaoApagouTudo=Não foi possível apagar tudo em %1. Feche o que estiver usando os arquivos e apague a pasta à mão, se quiser.

[Code]
{ A pasta de dados: sempre <localappdata>\AuroraBoard, montada aqui e em mais nenhum lugar. }
function PastaDosDados(): String;
begin
  Result := AddBackslash(ExpandConstant('{localappdata}')) + '{#PastaDeDados}';
end;

function TemWebView2(Raiz: Integer; Chave: String): Boolean;
var
  Versao: String;
begin
  Result := RegQueryStringValue(Raiz, Chave, 'pv', Versao) and (Versao <> '') and (Versao <> '0.0.0.0');
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if not (TemWebView2(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{#ClienteWebView2}')
       or TemWebView2(HKLM, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{#ClienteWebView2}')
       or TemWebView2(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{#ClienteWebView2}')) then
    SuppressibleMsgBox(CustomMessage('SemWebView2'), mbInformation, MB_OK, IDOK);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Pasta: String;
begin
  if CurUninstallStep <> usPostUninstall then
    Exit;
  Pasta := PastaDosDados();
  if not DirExists(Pasta) then
    Exit;
  { Padrão: Não. Em desinstalação silenciosa (/SUPPRESSMSGBOXES), também Não. }
  if SuppressibleMsgBox(FmtMessage(CustomMessage('PerguntaApagarDados'), [Pasta]),
       mbConfirmation, MB_YESNO or MB_DEFBUTTON2, IDNO) = IDYES then
  begin
    if not DelTree(Pasta, True, True, True) then
      SuppressibleMsgBox(FmtMessage(CustomMessage('NaoApagouTudo'), [Pasta]), mbError, MB_OK, IDOK);
  end;
end;
