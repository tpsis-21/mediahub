<!DOCTYPE html>
<html lang="pt-BR">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta name="theme-color" content="#16213e">
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
	<title>Dashboard - Painel</title>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
	<style>
		/* Reset e Variáveis CSS */
		:root {
			--sidebar-width: 260px;
			--sidebar-width-collapsed: 80px;
			--page-bg: #0D1117; /* Fundo mais escuro */
			--sidebar-bg: #16213e; /* Fundo da sidebar */
			--card-bg: #16213e; /* Fundo dos cards */
			--border-color: #30363D;
			--text-color: #f0f0f0;
			--text-muted: #8B949E;
			--accent-color: #4e73df;
			--danger-color: #dc3545;
			--transition-speed: 0.3s;
			--border-radius: 10px;
			--box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
		}

		* {
			margin: 0;
			padding: 0;
			box-sizing: border-box;
		}

		/* Estilos Base */
		body {
			font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
			background-color: var(--page-bg);
			color: var(--text-color);
			min-height: 100vh;
			line-height: 1.6;
		}

		/* Layout Principal */
		.page-wrapper {
			display: flex;
			min-height: 100vh;
			position: relative;
		}

		/* Sidebar */
		#sidebar {
			width: var(--sidebar-width);
			background: var(--sidebar-bg);
			border-right: 1px solid var(--border-color);
			transition: all var(--transition-speed) ease;
			display: flex;
			flex-direction: column; /* Coloca os filhos em coluna */
			position: fixed;
			top: 0;
			left: 0;
			height: 100vh;
			z-index: 1003;
		}

		#sidebar-header {
			padding: 25px 20px;
			text-align: center;
			border-bottom: 1px solid var(--border-color);
			min-height: 80px;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			flex-shrink: 0; /* Impede que o cabeçalho encolha */
			position: relative; /* NOVO: Contexto para o botão de fechar */
		}

		.logo-title {
			font-size: 1.8rem;
			font-weight: 700;
			letter-spacing: 1px;
		}

		.logo-part-1 {
			color: #3B82F6; /* Azul do logo */
		}

		.logo-part-2 {
			color: #FACC15; /* Amarelo/Ouro do logo */
		}

		.logo-subtitle {
			font-size: 0.9rem;
			color: var(--text-muted);
			margin-top: 5px;
		}

		#sidebar-content {
			flex-grow: 1; /* Ocupa todo o espaço restante */
			padding: 15px 10px;
			overflow-y: auto; /* Adiciona rolagem se o conteúdo for muito longo */
			-ms-overflow-style: none;
			scrollbar-width: none;
			padding-bottom: 80px;
		}

		#sidebar-content::-webkit-scrollbar {
			display: none;
		}


		.sidebar-item {
			display: flex;
			align-items: center;
			padding: 14px 20px;
			color: var(--text-muted);
			text-decoration: none;
			transition: all var(--transition-speed);
			font-weight: 500;
			margin: 4px 10px;
			border-radius: var(--border-radius);
			white-space: nowrap;
		}

		.sidebar-item:hover {
			background: rgba(255, 255, 255, 0.05);
			color: #fff;
		}

		.sidebar-item.active {
			background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
			color: #fff;
			font-weight: 600;
			box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
		}
		
		.sidebar-item.active i {
			color: #fff;
		}

		.sidebar-item i {
			width: 24px;
			margin-right: 15px;
			font-size: 1.1rem;
			text-align: center;
			color: var(--text-muted);
			transition: color var(--transition-speed);
		}

		#sidebar-footer {
			padding: 10px 15px;
			border-top: 1px solid var(--border-color);
			flex-shrink: 0;
			position: sticky;
			bottom: 0;
			background: var(--sidebar-bg);
			z-index: 10;
		}

		.sidebar-item.logout {
			margin: 0;
			padding: 14px 20px;
			border-radius: var(--border-radius);
		}

		.sidebar-item.logout:hover {
			background: rgba(220, 53, 69, 0.1);
			color: var(--danger-color);
		}

		.soon-badge {
			font-size: 0.65rem;
			font-weight: 700;
			text-transform: uppercase;
			color: #FACC15;
			background-color: rgba(250, 204, 21, 0.1);
			padding: 3px 7px;
			border-radius: 5px;
			margin-left: auto;
		}

		/* Conteúdo Principal */
		#main-content {
			flex-grow: 1;
			margin-left: var(--sidebar-width);
			padding: 25px;
			transition: margin-left var(--transition-speed);
			min-height: 100vh;
		}

		/* Cabeçalho do Conteúdo da Página */
		.main-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding-bottom: 30px;
			border-bottom: 1px solid var(--border-color);
			margin-bottom: 30px;
		}

		.welcome-message h1 {
			font-size: 1.8rem;
			font-weight: 600;
		}
		.welcome-message p {
			color: var(--text-muted);
			font-size: 1rem;
		}

		/* Grid do Dashboard (usado apenas em index.php) */
		.dashboard-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
			gap: 20px;
		}

		.action-card {
			background-color: var(--card-bg);
			border: 1px solid var(--border-color);
			border-radius: var(--border-radius);
			padding: 25px;
			text-decoration: none;
			color: var(--text-color);
			transition: all 0.3s ease;
			display: flex;
			flex-direction: column;
			justify-content: space-between;
			min-height: 150px;
		}

		.action-card:hover {
			transform: translateY(-5px);
			border-color: var(--accent-color);
		}

		.card-top {
			display: flex;
			justify-content: space-between;
			align-items: flex-start;
		}

		.card-title {
			font-size: 1.1rem;
			font-weight: 500;
			color: var(--text-muted);
		}

		.card-icon {
			width: 48px;
			height: 48px;
			border-radius: 8px;
			display: flex;
			align-items: center;
			justify-content: center;
			font-size: 1.5rem;
			color: #fff;
		}
		
		/* Cores dos Ícones */
		.icon-blue { background: linear-gradient(145deg, #2563EB, #3B82F6); }
		.icon-green { background: linear-gradient(145deg, #16A34A, #22C55E); }
		.icon-purple { background: linear-gradient(145deg, #7C3AED, #9333EA); }
		.icon-orange { background: linear-gradient(145deg, #EA580C, #F97316); }
		.icon-red { background: linear-gradient(145deg, #DC2626, #EF4444); }
		.icon-yellow { background: linear-gradient(145deg, #EAB308, #FACC15); }
		.icon-cyan { background: linear-gradient(145deg, #0891B2, #06B6D4); }

		.card-main-content {
			margin-top: 15px;
		}

		.card-main-content span {
			font-size: 1.5rem;
			font-weight: 600;
			display: block;
		}
		
		/* Controles Mobile */
		#menu-toggle-button {
			display: none;
			position: fixed;
			top: 15px;
			left: 15px;
			z-index: 1002;
			background: var(--accent-color);
			color: white;
			border: none;
			border-radius: 50%;
			width: 45px;
			height: 45px;
			align-items: center;
			justify-content: center;
			cursor: pointer;
			font-size: 1rem;
		}

		/* NOVO: Botão de fechar dentro da sidebar */
		#sidebar-close-button {
			display: none; /* Escondido em desktop */
			position: absolute;
			top: 15px;
			right: 20px;
			background: transparent;
			border: none;
			color: var(--text-muted);
			font-size: 1.8rem;
			cursor: pointer;
			z-index: 1004;
		}
		#sidebar-close-button:hover {
			color: var(--text-color);
		}

		#overlay {
			display: none;
			position: fixed;
			top: 0; left: 0; width: 100%; height: 100%;
			background-color: rgba(0, 0, 0, 0.7);
			z-index: 1001;
		}

		/* Animações */
		@keyframes fadeIn {
			from { opacity: 0; transform: translateY(10px); }
			to { opacity: 1; transform: translateY(0); }
		}

		.fade-in {
			animation: fadeIn 0.5s ease-out forwards;
		}

		/* Responsividade */
		@media (max-width: 992px) {
			#sidebar {
				transform: translateX(-100%);
				box-shadow: 5px 0 15px rgba(0,0,0,0.2);
			}
			body.sidebar-open #sidebar {
				transform: translateX(0);
			}
			body.sidebar-open #overlay {
				display: block;
			}
			#main-content {
				margin-left: 0;
				padding-top: 80px; /* Ajustar padding para acomodar o botão fixo do menu */
			}
			#menu-toggle-button {
				display: flex;
			}
			#sidebar-close-button {
				display: block; /* NOVO: Mostra o botão de fechar em mobile */
			}
			#sidebar-footer .sidebar-item.logout {
				display: flex;
			}
		}

        
        .sidebar-icon-img {
            width: 24px;       /* Mesmo tamanho do seu ícone 'i' */
            height: 24px;
            margin-right: 15px; /* Mesmo espaçamento do seu ícone 'i' */
        }

        .disabled-item {
            color: var(--text-muted) !important; /* Cor de texto desabilitado que você já usa */
            opacity: 0.5;                        /* Efeito visual de desabilitado */
            cursor: not-allowed;                 /* Mouse vira "não permitido" */
        }

        .disabled-item:hover {
            background: transparent !important; /* Não muda a cor no hover */
            color: var(--text-muted) !important; /* Não muda a cor no hover */
            transform: none !important;          /* Não aplica efeito de hover */
        }
        	</style>
</head>
<body>
<div class="page-wrapper">
	<button id="menu-toggle-button" aria-label="Abrir menu">
		<i class="fas fa-bars"></i>
	</button>

	<div id="overlay"></div>
	
	<aside id="sidebar">
		<div id="sidebar-header">
			<button id="sidebar-close-button" aria-label="Fechar menu">
				<i class="fas fa-times"></i>
			</button>
			<div class="logo-title">
				<span class="logo-part-1">GERADOR</span><span class="logo-part-2">PRO</span>
			</div>
			<p class="logo-subtitle">Painel Administrativo</p>
		</div>
		
		<nav id="sidebar-content" aria-label="Menu principal">
			<a href="index.php" class="sidebar-item active">
				<i class="fa-solid fa-house"></i>
				<span>Dashboard</span>
			</a>
			<a href="cadastrar_whatsapp.php" class="sidebar-item ">
				<i class="fab fa-whatsapp"></i>
				<span>Configurar WhatsApp</span>
			</a>

            
            <div class="sidebar-item disabled-item">
                <img src="https://img.icons8.com/color/48/mercado-pago.png" alt="Mercado Pago" class="sidebar-icon-img"> 
                <span>Mercado Pago</span>
                <span class="soon-badge">EM BREVE</span>
            </div>
            			<a href="video.php" class="sidebar-item ">
	<i class="fa-solid fa-video"></i> <span>Gerar Vídeo</span>
</a>
	<a href="videos_prontos.php" class="sidebar-item ">
	<i class="fa-solid fa-video"></i> <span>Vídeo divulgação</span>
</a>
			<a href="futbanner.php" class="sidebar-item ">
				<i class="fas fa-futbol"></i>
				<span>Gerar Futebol</span>
				</a>
			<a href="guitexto.php" class="sidebar-item ">
				<i class="fa-regular fa-hand-point-right"></i>
				<span>Guia Futebol</span>
			</a>
			<a href="nba.php" class="sidebar-item ">
				<i class="fa-solid fa-basketball"></i>
				<span>Gerar NBA</span>
				</a>
				<a href="ufc.php" class="sidebar-item ">
				<i class="fa-solid fa-thumbs-up"></i>
				<span>Gerar ufc</span>
				</a>
				<a href="esportes.php" class="sidebar-item ">
				<i class="fas fa-trophy"></i>
				<span>Todos esportes</span>
				</a>
			<a href="painel.php" class="sidebar-item ">
				<i class="fas fa-film"></i>
				<span>Gerar Banner Filme</span>
			</a>
			<a href="series_banner.php" class="sidebar-item ">
				<i class="fas fa-tv"></i>
				<span>Gerar Banner<br>Séries/Novelas</span>
			</a>
			<a href="logo.php" class="sidebar-item ">
				<i class="fas fa-image"></i>
				<span>Logo</span>
			</a>
			
			
							<a href="config_telegram.php" class="sidebar-item ">
					<i class="fab fa-telegram-plane"></i>
					<span>Meu Telegram</span>
				</a>
			
			<a href="comprarcreditos.php" class="sidebar-item ">
	<i class="fas fa-coins"></i>
	<span>Comprar Créditos</span>
	
	<span class="selo-icone">
		<i class="fas fa-star"></i>
	</span>
</a>
			<a href="gerenciar_leads.php" class="sidebar-item ">
				<i class="fas fa-link"></i>
				<span>Link de Indicação</span>
			</a>
			
			
					</nav>
		
		<div id="sidebar-footer">
			<a href="logout.php" class="sidebar-item logout">
				<i class="fas fa-sign-out-alt"></i>
				<span>Sair</span>
			</a>
		</div>
	</aside>
	
	<main id="main-content">
<style>
/* SEU CSS EXISTENTE */
body {
    background: #0D1117;
    background: radial-gradient(ellipse at bottom, #1b2735 0%, #090a0f 100%);
    background-attachment: fixed;
}
.main-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
}
.vencimento-info {
    padding: 10px 20px;
    color: #fff;
    font-weight: 500;
    background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
    border-radius: var(--border-radius, 10px);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    gap: 10px;
    transition: transform 0.3s ease;
}
.vencimento-info:hover {
    transform: translateY(-2px);
}
.vencimento-info.expirado {
    background: linear-gradient(90deg, #e53935 0%, #f44336 100%);
}
.action-card {
    position: relative;
    overflow: hidden;
}
.action-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(120deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0) 100%);
    transform: skewX(-25deg);
    transition: left 0.7s ease-in-out;
}
.action-card:hover::before {
    left: 100%;
}

/* Base do Pop-up */
.popup-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    display: none;
    justify-content: center;
    align-items: center;
    z-index: 1001;
    animation: fadeIn 0.3s ease-out;
}
.popup-content {
    background: #161b22;
    padding: 2.5rem;
    border-radius: 15px;
    text-align: center;
    max-width: 450px;
    width: 90%;
    box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    transform: scale(0.95);
    animation: zoomIn 0.3s ease-out forwards;
    position: relative;
}
.popup-close {
    position: absolute;
    top: 10px;
    right: 15px;
    font-size: 2.5rem;
    line-height: 1;
    color: #aaa;
    cursor: pointer;
    transition: color 0.2s, transform 0.2s;
}
.popup-close:hover {
    color: #fff;
    transform: scale(1.1);
}
.popup-content h2 {
    font-size: 1.8rem;
    color: #fff;
    margin-bottom: 1rem;
}
.popup-content p {
    font-size: 1rem;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 2rem;
    line-height: 1.6;
}

/* Estilos Pop-up VENCIMENTO */
#popup-vencimento .popup-content {
    border: 2px solid #8b5cf6;
}
#popup-vencimento .popup-content.vencimento-hoje {
    border-color: #ffcc00;
    animation: zoomIn 0.3s ease-out forwards, pulse-glow 1.5s infinite;
}

/* NOVO: Estilos Pop-up LOGO (Borda Vermelha) */
#popup-logo .popup-content {
    border: 2px solid #e11d48;
    box-shadow: 0 0 20px rgba(225, 29, 72, 0.2);
}
#popup-logo .popup-icon {
    font-size: 3rem;
    color: #e11d48;
    margin-bottom: 1rem;
}

/* Estilos Pop-up CADASTRAR WHATSAPP */
#popup-cadastrar-whatsapp .popup-content {
    border: 2px solid #3b82f6; 
}
#popup-cadastrar-whatsapp .popup-icon {
    font-size: 3rem;
    color: #3b82f6;
    margin-bottom: 1rem;
}

/* Botões */
.btn-whatsapp {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 25px;
    background-color: #25D366;
    color: white !important;
    border-radius: 10px;
    text-decoration: none;
    font-weight: 600;
    transition: all 0.3s ease;
    border: none;
    cursor: pointer;
}
.btn-whatsapp:hover {
    transform: scale(1.05);
    box-shadow: 0 8px 20px rgba(37, 211, 102, 0.4);
}
.btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 25px;
    background: linear-gradient(90deg, #3b82f6 0%, #8b5cf6 100%);
    color: white !important;
    border-radius: 10px;
    text-decoration: none;
    font-weight: 600;
    transition: all 0.3s ease;
    border: none;
    cursor: pointer;
}
.btn-primary:hover {
    transform: scale(1.05);
    box-shadow: 0 8px 20px rgba(99, 102, 241, 0.4);
}
.btn-danger {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 25px;
    background: linear-gradient(90deg, #e11d48 0%, #be123c 100%);
    color: white !important;
    border-radius: 10px;
    text-decoration: none;
    font-weight: 600;
    transition: all 0.3s ease;
    border: none;
    cursor: pointer;
}
.btn-danger:hover {
    transform: scale(1.05);
    box-shadow: 0 8px 20px rgba(225, 29, 72, 0.4);
}

/* Animações */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes zoomIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
@keyframes pulse-glow {
    0% { box-shadow: 0 0 15px #ffcc00, 0 0 20px rgba(0,0,0,0.5); }
    50% { box-shadow: 0 0 30px #ffdd57, 0 0 20px rgba(0,0,0,0.5); }
    100% { box-shadow: 0 0 15px #ffcc00, 0 0 20px rgba(0,0,0,0.5); }
}
</style>

<header class="main-header fade-in">
    <div class="welcome-message">
        <h1>Bem-vindo, eltopplay!</h1>
        <p>O que você gostaria de fazer hoje?</p>
    </div>
    
    <div class="vencimento-info ">
        <i class="fas fa-calendar-alt"></i>
        <span>Vence em: 21/02/2026</span>
    </div>
</header>

<div class="dashboard-grid fade-in">
            <a href="https://wa.me/84981175632" class="action-card" target="_blank">
            <div class="card-top">
                <div class="card-title">Suporte Revendedor</div>
                <div class="card-icon icon-green"><i class="fab fa-whatsapp"></i></div>
            </div>
            <div class="card-main-content"><span>Chamar no WhatsApp</span></div>
        </a>
        <a href="futbanner.php" class="action-card">
        <div class="card-top">
            <div class="card-title">Banner Futebol</div>
            <div class="card-icon icon-green"><i class="fas fa-futbol"></i></div>
        </div>
        <div class="card-main-content"><span>Criar Arte</span></div>
    </a>
    <a href="video.php" class="action-card">
        <div class="card-top">
            <div class="card-title">Gerador de Vídeo</div>
            <div class="card-icon icon-red"><i class="fa-solid fa-video"></i></div>
        </div>
        <div class="card-main-content"><span>Criar Vídeo</span></div>
    </a>
    <a href="painel.php" class="action-card">
        <div class="card-top">
            <div class="card-title">Banner Filmes</div>
            <div class="card-icon icon-purple"><i class="fas fa-film"></i></div>
        </div>
        <div class="card-main-content"><span>Montar Banner</span></div>
    </a>
    <a href="series_banner.php" class="action-card">
        <div class="card-top">
            <div class="card-title">Banner Séries/Novelas</div>
            <div class="card-icon icon-orange"><i class="fas fa-tv"></i></div>
        </div>
        <div class="card-main-content"><span>Criar Divulgação</span></div>
    </a>
    <a href="logo.php" class="action-card">
        <div class="card-top">
            <div class="card-title">Logo</div>
            <div class="card-icon icon-blue"><i class="fas fa-image"></i></div>
        </div>
        <div class="card-main-content"><span>Configurar</span></div>
    </a>
    <a href="https://t.me/geradorpro_original" class="action-card" target="_blank">
        <div class="card-top">
            <div class="card-title">Canal Telegram</div>
            <div class="card-icon icon-blue"><i class="fa-brands fa-telegram"></i></div>
        </div>
        <div class="card-main-content"><span>Entrar</span></div>
    </a>

    
    
    <a href="logout.php" class="action-card">
        <div class="card-top">
            <div class="card-title">Sair</div>
            <div class="card-icon icon-red"><i class="fas fa-sign-out-alt"></i></div>
        </div>
        <div class="card-main-content"><span>Deslogar</span></div>
    </a>
</div>

        <div id="popup-vencimento" class="popup-backdrop">
        <div class="popup-content vencimento-hoje">
            <span class="popup-close">&times;</span>
            <h2>Sua Assinatura Está Expirando!</h2>
            <p>Seu acesso vence <strong>HOJE</strong>!</p>
                            <p>Para não perder o acesso, entre em contato com seu revendedor e solicite a renovação.</p>
                <a href="https://wa.me/84981175632" target="_blank" class="btn-whatsapp">
                    <i class="fab fa-whatsapp"></i> Renovar com Revendedor
                </a>
                    </div>
    </div>



    </main> <!-- Fecha a tag main-content do header.php -->
</div> <!-- Fecha a tag page-wrapper do header.php -->

<script>
document.addEventListener('DOMContentLoaded', () => {
    // Seleciona todos os botões que controlam o menu
    const menuToggleButton = document.getElementById('menu-toggle-button');
    const sidebarCloseButton = document.getElementById('sidebar-close-button'); // <-- NOVO
    const overlay = document.getElementById('overlay');
    const body = document.body;

    // Função única para abrir/fechar o menu
    function toggleMenu() {
        body.classList.toggle('sidebar-open');
    }

    // Adiciona o evento de clique para cada elemento
    if (menuToggleButton) {
        menuToggleButton.addEventListener('click', toggleMenu);
    }
    if (overlay) {
        overlay.addEventListener('click', toggleMenu);
    }
    if (sidebarCloseButton) { // <-- NOVO
        sidebarCloseButton.addEventListener('click', toggleMenu);
    }
    
    // --- Seu código para marcar o menu ativo (mantido como estava) ---
    const currentPage = window.location.pathname.split('/').pop();
    const menuItems = document.querySelectorAll('#sidebar-content .sidebar-item');
    
    let hasActive = false;
    menuItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('href') === currentPage) {
            item.classList.add('active');
            hasActive = true;
        }
    });

    if (!hasActive && (currentPage === '' || currentPage === 'index.php')) {
        const dashboardItem = document.querySelector('#sidebar-content a[href="index.php"]');
        if(dashboardItem) {
            dashboardItem.classList.add('active');
        }
    }

    // --- Sua correção para o SweetAlert (mantida como estava) ---
    window.addEventListener('pageshow', function (event) {
        if (event.persisted) {
            if (typeof Swal !== 'undefined' && Swal.isVisible()) {
                Swal.close();
            }
        }
    });
});
</script>

<script defer src="https://static.cloudflareinsights.com/beacon.min.js/vcd15cbe7772f49c399c6a5babf22c1241717689176015" integrity="sha512-ZpsOmlRQV6y907TI0dKBHq9Md29nnaEIPlkf84rnaERnq6zvWvPUqr2ft8M1aS28oN72PdrCzSjY4U6VaAw1EQ==" data-cf-beacon='{"version":"2024.11.0","token":"75b1a7a184594134a54200d65bf000a1","r":1,"server_timing":{"name":{"cfCacheStatus":true,"cfEdge":true,"cfExtPri":true,"cfL4":true,"cfOrigin":true,"cfSpeedBrain":true},"location_startswith":null}}' crossorigin="anonymous"></script>
</body>
</html>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const now = new Date().getTime();
    
    // --- 1. Lógica Pop-up VENCIMENTO ---
    const popupVencimento = document.getElementById('popup-vencimento');
    let vencimentoEstaVisivel = false;

    if (popupVencimento) {
        const closeBtnVencimento = popupVencimento.querySelector('.popup-close');
        const popupKeyVencimento = 'popupVencimentoClosed_2282';
        const hideUntilVencimento = localStorage.getItem(popupKeyVencimento);

        // Se NÃO tiver registro de fechado ou o tempo já passou
        if (!hideUntilVencimento || now > parseInt(hideUntilVencimento)) {
            popupVencimento.style.display = 'flex';
            vencimentoEstaVisivel = true;
        }

        closeBtnVencimento.addEventListener('click', function() {
            popupVencimento.style.display = 'none';
            // Oculta por 6 horas
            const hoursToHide = 6;
            const hideUntilTime = now + (hoursToHide * 60 * 60 * 1000);
            localStorage.setItem(popupKeyVencimento, hideUntilTime);
            
            // Tenta abrir o de logo imediatamente se ele estiver pendente
            checkAndShowLogo(); 
        });
    }

    // --- 2. Lógica Pop-up LOGO ---
    const popupLogo = document.getElementById('popup-logo');
    
    function checkAndShowLogo() {
        if (popupLogo) {
            const closeBtnLogo = popupLogo.querySelector('.popup-close');
            const popupKeyLogo = 'popupLogoClosed_2282';
            const hideUntilLogo = localStorage.getItem(popupKeyLogo);
            
            // Verifica se o Vencimento está visível neste exato momento
            let isVencimentoOpen = false;
            if (popupVencimento) {
                const style = window.getComputedStyle(popupVencimento);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    isVencimentoOpen = true;
                }
            }

            // Só mostra se: (Não está no cache de fechado) E (Vencimento não está cobrindo)
            if ((!hideUntilLogo || now > parseInt(hideUntilLogo)) && !isVencimentoOpen) {
                popupLogo.style.display = 'flex';
            }

            // Evento de fechar
            closeBtnLogo.onclick = function() {
                popupLogo.style.display = 'none';
                // Reaparece em 1 hora
                const hoursToHide = 1; 
                const hideUntilTime = now + (hoursToHide * 60 * 60 * 1000);
                localStorage.setItem(popupKeyLogo, hideUntilTime);
                
                // Tenta mostrar o do WhatsApp se houver
                checkAndShowWhatsapp();
            };
        } else {
            // Se não tem logo para mostrar, checa o zap
            checkAndShowWhatsapp();
        }
    }

    // --- 3. Lógica Pop-up WHATSAPP ---
    const popupWhatsapp = document.getElementById('popup-cadastrar-whatsapp');
    
    function checkAndShowWhatsapp() {
        if (popupWhatsapp) {
            const closeBtnWhatsapp = popupWhatsapp.querySelector('.popup-close');
            const popupKeyWhatsapp = 'popupWhatsappClosed_2282';
            const hideUntilWhatsapp = localStorage.getItem(popupKeyWhatsapp);

            // Verifica se Vencimento ou Logo estão abertos
            let isVencimentoOpen = false;
            if (popupVencimento) {
                const style = window.getComputedStyle(popupVencimento);
                if (style.display !== 'none' && style.visibility !== 'hidden') isVencimentoOpen = true;
            }
            
            let isLogoOpen = false;
            if (popupLogo) {
                const style = window.getComputedStyle(popupLogo);
                if (style.display !== 'none' && style.visibility !== 'hidden') isLogoOpen = true;
            }

            if ((!hideUntilWhatsapp || now > parseInt(hideUntilWhatsapp)) && !isVencimentoOpen && !isLogoOpen) {
                popupWhatsapp.style.display = 'flex';
            }

            closeBtnWhatsapp.onclick = function() {
                popupWhatsapp.style.display = 'none';
                const hoursToHide = 24;
                const hideUntilTime = now + (hoursToHide * 60 * 60 * 1000);
                localStorage.setItem(popupKeyWhatsapp, hideUntilTime);
            };
        }
    }

    // Inicia a verificação em cadeia
    if (!vencimentoEstaVisivel) {
        checkAndShowLogo();
    }
});
</script>