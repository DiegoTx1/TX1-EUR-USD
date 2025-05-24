
let win = 0, loss = 0;
let ultimos = [];
let stopAtivo = false;
let ws = null;

const APP_ID = "1089";
const SYMBOL = "frxEURUSD";

function atualizarHora() {
  const agora = new Date();
  document.getElementById("hora").textContent = agora.toLocaleTimeString("pt-BR");
}

function registrar(tipo) {
  if (tipo === 'WIN') win++;
  else loss++;
  document.getElementById("historico").textContent = `${win} WIN / ${loss} LOSS`;
  if (loss >= 2) {
    stopAtivo = true;
    document.getElementById("comando").textContent = "STOP";
  }
}

function calcularRSI(candles) {
  let gains = 0, losses = 0;
  for (let i = 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / candles.length;
  const avgLoss = losses / candles.length;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function detectarEngolfo(open1, close1, open2, close2) {
  return (close2 > open2 && open2 < close1 && close2 > open1) ||
         (close2 < open2 && open2 > close1 && close2 < open1) ? 1 : 0;
}

function cruzamentoSMA(candles) {
  const sma = (data, periodo) => data.slice(-periodo).reduce((s, c) => s + c.close, 0) / periodo;
  const sma5_antes = (candles.slice(-6, -1)).reduce((s, c) => s + c.close, 0) / 5;
  const sma10_antes = (candles.slice(-11, -6)).reduce((s, c) => s + c.close, 0) / 5;
  if (sma5_antes > sma10_antes) return "CALL";
  else if (sma5_antes < sma10_antes) return "PUT";
  return "ESPERAR";
}

function forcaVelas(candles) {
  let altas = 0, baixas = 0;
  for (let i = candles.length - 3; i < candles.length; i++) {
    if (candles[i].close > candles[i].open) altas++;
    else if (candles[i].close < candles[i].open) baixas++;
  }
  if (altas >= 3) return "CALL";
  else if (baixas >= 3) return "PUT";
  return "ESPERAR";
}


function calcularEMA(candles, periodo = 10) {
  let k = 2 / (periodo + 1);
  let ema = candles[0].close;
  for (let i = 1; i < candles.length; i++) {
    ema = candles[i].close * k + ema * (1 - k);
  }
  return ema;
}



function avaliarSinal(candles) {
  let criterios = [];
  let score = 0;

  const rsi = calcularRSI(candles);
  if (rsi > 60) {
    criterios.push("RSI alto");
    score += 20;
  } else if (rsi < 40) {
    criterios.push("RSI baixo");
    score += 20;
  }

  if (detectarEngolfo(candles[8].open, candles[8].close, candles[9].open, candles[9].close)) {
    criterios.push("Padrão de Engolfo");
    score += 20;
  }

  const tendencia = forcaVelas(candles);
  if (tendencia !== "ESPERAR") {
    criterios.push("Força das Velas: " + tendencia);
    score += 20;
  }

  const sma = cruzamentoSMA(candles);
  const ema = calcularEMA(candles);
  if ((sma === "CALL" && candles[candles.length - 1].close > ema) ||
      (sma === "PUT" && candles[candles.length - 1].close < ema)) {
    criterios.push("Confirmação por EMA");
    score += 20;
  }

  if (sma !== "ESPERAR") {
    criterios.push("SMA: " + sma);
    score += 40;
  }

  let sinalFinal = "ESPERAR";
  if (score >= 85) {
    sinalFinal = sma !== "ESPERAR" ? sma : tendencia;
  }

  document.getElementById("comando").textContent = sinalFinal;
  return { sinal: sinalFinal, score, criterios };
}


function atualizarInterface(sinal, score, criterios) {
  if (!stopAtivo) {
    document.getElementById("comando").textContent = sinal;
    document.getElementById("score").textContent = `${score}%`;
  }

  const ul = document.getElementById("criterios");
  ul.innerHTML = "";
  criterios.forEach(c => {
    const li = document.createElement("li");
    li.textContent = c;
    ul.appendChild(li);
  });

  ultimos.unshift(`${sinal} (${score}%)`);
  if (ultimos.length > 5) ultimos.pop();

  const ulUltimos = document.getElementById("ultimos");
  ulUltimos.innerHTML = "";
  ultimos.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    ulUltimos.appendChild(li);
  });

  atualizarHora();
}

function conectarWebSocket() {
  try {
    ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${APP_ID}`);

    ws.onopen = function () {
      ws.send(JSON.stringify({
        ticks_history: SYMBOL,
        adjust_start_time: 1,
        count: 10,
        end: "latest",
        start: 1,
        style: "candles",
        granularity: 60
      }));
    };

    ws.onmessage = function (event) {
      const data = JSON.parse(event.data);
      if (!data.history || !data.history.candles) return;

      const candles = data.history.candles;
      const resultado = avaliarSinal(candles);
      atualizarInterface(resultado.sinal, resultado.score, resultado.criterios);

      setTimeout(() => {
        ws.send(JSON.stringify({
          ticks_history: SYMBOL,
          adjust_start_time: 1,
          count: 10,
          end: "latest",
          start: 1,
          style: "candles",
          granularity: 60
        }));
      }, 60000);
    };

    ws.onerror = function (error) {
      console.error("Erro na conexão WebSocket:", error);
    };

    ws.onclose = function () {
      console.warn("WebSocket fechado. Tentando reconectar em 5 segundos...");
      setTimeout(conectarWebSocket, 5000);
    };
  } catch (e) {
    console.error("Erro ao conectar:", e);
  }
}

window.onload = function () {
  
  atualizarHora();
};



let tempoRestante = 60;
setInterval(() => {
  if (tempoRestante > 0) {
    tempoRestante--;
    document.getElementById("timer").textContent = tempoRestante;
  }
}, 1000);



function buscarCandlesTwelveData() {
  fetch("https://api.twelvedata.com/time_series?symbol=EUR/USD&interval=1min&outputsize=10&apikey=demo")
    .then(response => response.json())
    .then(data => {
      if (!data.values || data.values.length === 0) return;

      // Reverter para ordem cronológica
      tempoRestante = 60;
      const candles = data.values.reverse().map(c => ({
        open: parseFloat(c.open),
        close: parseFloat(c.close)
      }));

      const resultado = avaliarSinal(candles);
      atualizarInterface(resultado.sinal, resultado.score, resultado.criterios);
    })
    .catch(error => console.error("Erro ao buscar dados:", error));
}

// Atualizar a cada 60s
setInterval(buscarCandlesTwelveData, 60000);
window.onload = function () {
  buscarCandlesTwelveData();
  atualizarHora();
};


// Reiniciar operação automaticamente após 5 minutos de STOP
setInterval(() => {
  if (stopAtivo) {
    console.log("Reiniciando após STOP...");
    stopAtivo = false;
    document.getElementById("comando").textContent = "REINICIADO";
  }
}, 300000); // 5 minutos


function verificarResultado(candles, sinal) {
  if (candles.length < 2 || (sinal !== "CALL" && sinal !== "PUT")) return;

  const ultima = candles[candles.length - 2];
  const atual = candles[candles.length - 1];

  if (sinal === "CALL" && atual.close > ultima.close) {
    registrar("WIN");
  } else if (sinal === "PUT" && atual.close < ultima.close) {
    registrar("WIN");
  } else {
    registrar("LOSS");
  }
}


function detectarMartelo(open, close, high, low) {
  const corpo = Math.abs(close - open);
  const sombraInferior = Math.min(open, close) - low;
  const sombraSuperior = high - Math.max(open, close);
  return sombraInferior > 2 * corpo && sombraSuperior < corpo;
}

function detectarEstrelaCadente(open, close, high, low) {
  const corpo = Math.abs(close - open);
  const sombraSuperior = high - Math.max(open, close);
  const sombraInferior = Math.min(open, close) - low;
  return sombraSuperior > 2 * corpo && sombraInferior < corpo;
}

function detectarDoji(open, close, high, low) {
  const corpo = Math.abs(close - open);
  return corpo <= (high - low) * 0.1;
}

function calcularBollingerBands(closes, periodo = 20) {
  if (closes.length < periodo) return null;
  const sma = closes.slice(-periodo).reduce((a, b) => a + b) / periodo;
  const variancia = closes.slice(-periodo).reduce((a, b) => a + Math.pow(b - sma, 2), 0) / periodo;
  const desvioPadrao = Math.sqrt(variancia);
  return {
    superior: sma + (2 * desvioPadrao),
    inferior: sma - (2 * desvioPadrao),
    sma: sma
  };
}

function avaliarVolatilidade(bollinger) {
  return (bollinger.superior - bollinger.inferior) > (bollinger.sma * 0.005);
}

function autoRegistrarResultado(prevClose, signal, nextClose) {
  if (signal === "CALL" && nextClose > prevClose) return "WIN";
  if (signal === "PUT" && nextClose < prevClose) return "WIN";
  return "LOSS";
}
