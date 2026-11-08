# SyncSom

Toca a **mesma música ao mesmo tempo** em vários aparelhos (celulares, tablets, notebooks) conectados no mesmo Wi-Fi. Funciona em qualquer aparelho com navegador, sem instalar nada neles.

## Como funciona

- Um computador (ou celular com Termux) roda o servidor deste projeto.
- Cada aparelho abre o endereço do servidor no navegador e toca em **Entrar**.
- Você adiciona músicas por qualquer aparelho. O servidor controla play, pause, pular e posição, e todos tocam alinhados.
- A caixa de som de cada aparelho é conectada nele normalmente (Bluetooth ou cabo P2/USB). Resultado: quantos aparelhos, tantas caixas tocando juntas.

## Como rodar

1. Instale o [Node.js](https://nodejs.org) (versão 18 ou mais nova).
2. Dentro da pasta do projeto:

   ```
   npm install
   npm start
   ```

3. O terminal mostra os endereços, algo como `http://192.168.0.15:3000`. Abra esse endereço no navegador de cada aparelho (todos no mesmo Wi-Fi) e toque em **Entrar**.
4. Em qualquer aparelho, toque em **Adicionar músicas** e escolha os arquivos. Toque em uma música para começar.

Se os outros aparelhos não abrirem o endereço, libere a porta 3000 no firewall do computador que roda o servidor.

## Dicas para ficar bem sincronizado

- **Ajuste de atraso:** caixas Bluetooth atrasam o som (de 100 a 300 ms, cada modelo é diferente). Em cada aparelho há um controle "Atraso do som". Se aquela caixa soa atrasada em relação às outras, mova o controle para a direita até alinhar. O ajuste fica salvo no aparelho.
- **Mantenha a tela ligada** nos aparelhos. O app tenta travar a tela acesa, mas alguns navegadores pausam o som em segundo plano.
- Caixas com cabo têm atraso quase zero, então servem de referência para acertar as de Bluetooth.
- O indicador no topo mostra quantos aparelhos estão conectados e o desvio atual deste aparelho em relação ao tempo certo.

## Limites

- Só toca **arquivos de áudio** (MP3, M4A, WAV, OGG, FLAC...) enviados pelo próprio app. Spotify, YouTube e similares não dão acesso ao áudio, então não funcionam.
- Uma caixa Bluetooth **sozinha** (sem um celular, tablet ou computador ligado a ela) não consegue entrar, porque ela não abre páginas web.
- Quem estiver no seu Wi-Fi e abrir o endereço pode controlar a música. Não há senha.
- As músicas enviadas são apagadas quando o servidor é reiniciado. Tamanho máximo por arquivo: 100 MB.
