import type { IPresidentialBriefing } from "./briefingTypes.js";

// Turn 12 mock data — presidential scenario.
export const mockBriefing: IPresidentialBriefing = {
  header: {
    turn: 12,
    date: "10 de outubro de 2026",
    intervalDays: 7,
    periodStr: "Semana 12 · 3–10 Out 2026",
  },
  executiveSummary:
    "Senhor Presidente, a semana transcorreu com progressos significativos na frente econômica, mas desafios persistentes na segurança pública e na diplomacia comercial exigem sua atenção imediata. O PIB cresceu 2,3%, acima da expectativa, impulsionado pelo agronegócio e pela indústria de transformação. Contudo, a inflação de 5,4% permanece acima da meta, e a guerra ao crime organizado na fronteira norte entrou em fase crítica. A União Europeia avançou com medidas protecionistas que ameaçam nossas exportações de carne e aço. O Congresso mantém base sólida (62 senadores, 315 deputados), mas a reforma tributária enfrenta resistência na CCJ. A escalada global permanece baixa (nível 2), mas pontos de tensão bilaterais exigem manobra diplomática precisa.",
  specialReports: [
    {
      id: "anti-corruption-shield",
      title: "Operação Escudo Anticorrupção",
      subtitle: "Relatório Conjunto CGU · PF · Ministério da Transparência",
      sections: [
        {
          heading: "Execução Operacional",
          content:
            "Foram abertos 14 novos inquéritos nesta semana, com 7 mandados de prisão cumpridos em quatro estados. O foco recaiu sobre esquemas de licitação em obras rodoviárias, com desvios estimados em R$ 340 milhões. A cooperação com o FBI rendeu o compartilhamento de 3 relatórios financeiros sobre lavagem de dinheiro via criptomoedas.",
          metrics: {
            "Inquéritos abertos": 14,
            "Prisões efetuadas": 7,
            "Desvio estimado": "R$ 340M",
            "Estados envolvidos": 4,
          },
        },
        {
          heading: "Frente Legislativa",
          content:
            "O Projeto de Lei 4.471/2026 (Registro de Beneficiários Finais) avançou na comissão especial com votação de 17 a 8. A oposição apresentou 12 destaques para o plenário. A líder do governo no Senado sinaliza votação em regime de urgência até a próxima quinzena.",
          metrics: {
            "Votação comissão": "17 x 8",
            "Destaques oposição": 12,
          },
        },
        {
          heading: "Recomendação Estratégica",
          content:
            "O Ministro da Transparência recomenda manutenção do ritmo operacional e articulação pessoal com o presidente do Senado para garantir a votação do PL 4.471 antes do recesso parlamentar. A exposição midiática deve ser comedida para não comprometer investigações em andamento.",
        },
      ],
      recommendation:
        "Manter ritmo operacional. Articular pessoalmente com presidente do Senado para votação do PL 4.471 antes do recesso.",
    },
    {
      id: "tax-reform-mega-rich",
      title: "Reforma Tributária & Cadastro de Mega-Ricos",
      subtitle: "Ministério da Fazenda · Receita Federal",
      sections: [
        {
          heading: "Marco Tributário",
          content:
            "A proposta de Imposto de Renda progressivo sobre grandes fortunas (alíquotas de 1% a 3% sobre patrimônios acima de R$ 50 milhões) obteve suporte inicial de 4 das 6 bancadas. O cadastro obrigatório de beneficiários finais em trustes e holdings foi incluído como emenda plenária. A Receita estima arrecadação adicional de R$ 28 bilhões/ano.",
          metrics: {
            "Arrecadação estimada": "R$ 28B/ano",
            "Bancadas favoráveis": "4 de 6",
            "Faixa de incidência": "R$ 50M+",
          },
        },
        {
          heading: "Resistência Política",
          content:
            "A Federação das Indústrias (CNI) e a associação de fundos de investimento emitiram notas técnicas contrárias, alegando fuga de capitais. Três senadores da base aliada do Centro-Oeste sinalizaram abstenção. O Ministro da Fazenda propõe escalonamento gradual (0,5% no ano 1) como meio-termo.",
          metrics: {
            "Senadores em dúvida": 3,
          },
        },
        {
          heading: "Recomendação Estratégica",
          content:
            "O Ministro da Fazenda recomenda aprovar o cadastro (consenso fácil) e postergar a alíquota para audiências públicas, preservando a agenda legislativa sem gastar capital político prematuramente.",
        },
      ],
      recommendation:
        "Aprovar cadastro agora. Postergar alíquota para audiências públicas — preservar capital político.",
    },
    {
      id: "public-security-plan",
      title: "Plano Nacional de Segurança Pública",
      subtitle: "Ministério da Justiça · Gabinete de Segurança Institucional",
      sections: [
        {
          heading: "Frente Norte — Fase Crítica",
          content:
            "A operação 'Fronteira Segura' completou sua 4ª semana com resultados mistos. Houveram 23 baixas criminais, 180 prisões e apreensão de 2,3 toneladas de cocaína. Contudo, três cidades do Amazonas registram bloqueio de rodovias por facções, e o Comando Militar da Amazônia solicita reforço de 1.500 efetivos. A PF identificou rota de financiamento via Venezuela.",
          metrics: {
            "Prisões": 180,
            "Baixas criminais": 23,
            "Cocaína apreendida": "2,3 ton",
            "Cidades em bloqueio": 3,
          },
        },
        {
          heading: "Articulação Federativa",
          content:
            "Cinco governadores assinaram termo de cooperação para o Sistema Único de Segurança Pública (SUSP). Roraima e Amazonas demandam auxílio financeiro emergencial. O Ministério da Justiça propõe decreto de Garantia da Lei e da Ordem (GLO) para os municípios críticos.",
          metrics: {
            "Governadores aderentes": 5,
            "Estados em GLO": 2,
          },
        },
        {
          heading: "Recomendação Estratégica",
          content:
            "O Ministro da Justiça recomenda o decreto de GLO em Roraima e Amazonas com duração de 30 dias, prorrogável, articulado com Forças Armadas. Evitar nacionalização do plano para não sobrecarregar o orçamento e preservar legitimidade federativa.",
        },
      ],
      recommendation:
        "Decretar GLO em Roraima e Amazonas (30 dias prorrogável). Evitar nacionalização — preservar legitimidade federativa.",
    },
  ],
  domainResults: [
    {
      domain: "militar",
      label: "Militar / Segurança",
      status: "warning",
      summary:
        "GLO aprovada em 2 estados. Operação Fronteira Segura na 4ª semana — resultados táticos satisfatórios, mas/logística crítica.",
      details: [
        "1.500 efetivos do CMA em prontidão para reforço fronteiriço",
        "2,3 toneladas de cocaína apreendidas; 180 prisões efetuadas",
        "3 cidades do Amazonas com rodovias bloqueadas por facções",
        "Roraima e Amazonas em estado de GLO por 30 dias",
        "Nenhum incidente transfronteiriço com Venezuela registrado",
      ],
    },
    {
      domain: "inteligencia",
      label: "Inteligência / Ciber",
      status: "success",
      summary:
        "ABIN mapeou 14 células de financiamento. Ciberdefesa repeliu 312 ataques a sistemas governamentais.",
      details: [
        "14 células de financiamento criminoso mapeadas pela ABIN",
        "312 ataques cibernéticos repelidos (22% acima da média semanal)",
        "Rota de lavagem via criptomoedas identificada em parceria com FBI",
        "Operação Mirror Deaf: fase 2 concluída, 4 alvos sob vigilância",
        "Nenhum vazamento de dados classificados detectado",
      ],
    },
    {
      domain: "diplomatico",
      label: "Diplomático",
      status: "critical",
      summary:
        "UE avança com barreiras tarifárias a carne e aço. Itamaraty propõeaccord comercial bilateral urgente.",
      details: [
        "Comissão Europeia publica regulamento de barreira tarifária (12% sobre carne, 8% sobre aço)",
        "Exportações brasileiras afetadas: estimativa de R$ 9,2 bilhões/ano",
        "Embaixador em Bruxelas convocado para reunião bilateral urgente",
        "Proposta 'Iniciativa Belém' para acordo sul-americano de complementação",
        "China sinaliza interesse em acordo bilateral como contraparte estratégica",
      ],
    },
    {
      domain: "politico_economico",
      label: "Político / Econômico",
      status: "success",
      summary:
        "PIB cresce 2,3% (acima da meta). Inflação 5,4% ainda pressionada. Base congressual sólida.",
      details: [
        "PIB: +2,3% no trimestre (acima da projeção de 1,8%)",
        "Inflação IPCA: 5,4% (meta: 3,0% ± 1,5) — presso mantida por alimentos",
        "Base aliada: 62/81 senadores, 315/513 deputados",
        "Reforma tributária: PL 4.471 aprovado em comissão especial (17x8)",
        "Câmbio: R$ 5,12/USD (estável); reservas em US$ 348 bilhões",
      ],
    },
    {
      domain: "projetos",
      label: "Projetos Estratégicos",
      status: "neutral",
      summary:
        "Ferrogrão em licenciamento ambiental fase 2. PAC Novo executou 41% do previsto.",
      details: [
        "Ferrogrão: licenciamento ambiental em fase 2 (previsto: concluído)",
        "PAC Novo: 41% de execução orçamentária (meta: 50%)",
        "Transposição do São Francisco: conclusão prevista para Q1 2027",
        "Programa Mais Médicos: 14.200 profissionais atuando (meta: 18.000)",
        "Nova ferrovia Norte-Sul: trecho 3 em licitação (3 consórcios habilitados)",
      ],
    },
    {
      domain: "comunicacao",
      label: "Comunicação Presidencial",
      status: "warning",
      summary:
        "Aprovação 72%, mas rejeição subiu 2pp na região Norte. Entrevista ao Roda Viva confirmada.",
      details: [
        "Aprovação: 72% (nacional) — rejeição 19% (alta de 2pp no Norte)",
        "Entrevista Roda Viva confirmada para 17/10",
        "Redes sociais: 4,2M interações (semana), 89% positivas",
        "Gabinete digital: 12.400 manifestações cidadãs processadas",
        "Press briefing semanal: cobertura de 47 veículos (8 negativos)",
      ],
    },
  ],
  worldDevelopments: [
    {
      category: "Mercado / Commodities",
      headline: "Brent Crude subiu 4,1% para US$ 89/barril após tensão no Golfo Pérsico",
      impact: "Pressão sobre conta de petróleo; Gasolina pode subir R$ 0,15/L",
    },
    {
      category: "Geopolítica",
      headline: "China anuncia pacote de estímulo de US$ 280 bilhões; índices Xangai +3,2%",
      impact: "Demanda por commodities sul-americanas deve aumentar no Q4",
    },
    {
      category: "Diplomacia",
      headline: "UE aprova regulamento CBAM (Carbon Border Adjustment) em versão final",
      impact: "Exportações brasileiras de aço e alumínio sofrem tarifa carbono de € 32/ton",
    },
    {
      category: "Inteligência",
      headline: "Serviços russos detectados em campanha de desinformação na América Latina",
      impact: "Brasil identificado como alvo secundário; ABIN recomenda monitoramento ativo",
    },
    {
      category: "Segurança",
      headline: "Cartel de Sinaloa sofre cisão interna; fluxo migratório em fronteira sul do México",
      impact: "Potencial redirecionamento de rotas de tráfico para corredor amazônico",
    },
  ],
  intelligenceRadar: [
    {
      target: "Cartel PCC — Célula Amazônia",
      confidence: "ALTA",
      update:
        "Liderança identificada em Manaus. Célula financeira rastreada via exchange BitGo. Recomenda-se operação simultânea com PF e Forças Armadas.",
    },
    {
      target: " Venezuela — GNB fronteiriço",
      confidence: "MEDIA",
      update:
        "Movimentação anômala de tropas detectada em Santa Elena de Uairén. Satélite confirma 8 veículos blindados. Avaliação: exercício de rotina ou pressão diplomática.",
    },
    {
      target: "UE — Comissão de Comércio",
      confidence: "CRITICA",
      update:
        "Documento vazado confirma votação tarifária acelerada em 15 dias. Janela diplomática estreita. Embaixador recomenda chamada presidencial direta a von der Leyen.",
    },
    {
      target: "China — Embassy Brasília",
      confidence: "MEDIA",
      update:
        "Conselheiro comercial chinês propôs reunião reservada sobre 'acordos complementares'. Ministério da Fazenda sugere cautela — interesse em minerais de terras raras.",
    },
    {
      target: "Serviços Russos — Embaixada Moscou",
      confidence: "BAIXA",
      update:
        "Aumento de tráfego diplomático não-explicado. ABIN sem confirmação de infiltração. Recomenda-se monitoramento passivo por 4 semanas.",
    },
    {
      target: "Mercado Financeiro — B3",
      confidence: "ALTA",
      update:
        "Custos de crédito (CDS) do Brasil caíram 12 pontos-base. Captação externa acima de US$ 2,1 bi nesta semana. Sinal positivo para política fiscal.",
    },
  ],
  assessment: {
    tacticalResult:
      "Semana de avanços econômicos sólidos com pressão persistente em segurança e comércio exterior. Base política mantida.",
    rootCause:
      "Inflação acima da meta é estrutural (desorganização de cadeias alimentares). Crise fronteiriça decorre de cisão em cartel colombiano e fragilidade federativa. Ameaça europeia reflete lobby industrial interno da UE.",
    fiscalAndPoliticalCosts: [
      { item: "GLO em 2 estados (30 dias)", cost: "R$ 420M · 2pp rejeição Norte" },
      { item: "Reforço fronteiriço CMA (1.500 efetivos)", cost: "R$ 85M/semana" },
      { item: "Auxílio emergencial Roraima/Amazonas", cost: "R$ 180M · capital político baixo" },
      { item: "Campanha diplomática anti-CBAM", cost: "R$ 12M · 3 viagens presidenciais" },
      { item: "PL 4.471 cadastro mega-ricos (aprovação)", cost: "Baixo · reação Fiesp/CNI" },
    ],
    strategicOutlook:
      "Próximas 2-3 semanas são decisivas: (1) votação da reforma tributária; (2) resposta à medida europeia; (3) consolidação da GLO. Senhor Presidente, seu capital político está em pico (72%) mas não é infinito — recomenda-se priorizar reformas estruturais enquanto janela parlamentar estiver aberta.",
  },
  decisionOptions: [
    {
      domain: "security",
      domainLabel: "Segurança Pública",
      options: [
        {
          id: "sec-a",
          code: "A",
          title: "Decreto Plano Nacional de Segurança (GLO Federal)",
          description:
            "Decretar Garantia da Lei e da Ordem em Roraima e Amazonas por 30 dias prorrogáveis, com 1.500 efetivos do Comando Militar da Amazônia e coordenação PF/ABIN. Lançar pacote de R$ 1,2 bi para reassunção federativa.",
          estimatedCost: "Fiscal: R$ 1,2 bi · Político: 2pp rejeição Norte",
          projectedImpact:
            "Reduz 40% dos bloqueios em 2 semanas. Risco de judicialização. Reforça narrativa de 'mão firme'.",
        },
        {
          id: "sec-b",
          code: "B",
          title: "Integração Preparatória de Inteligência (Sem GLO)",
          description:
            "Adiar GLO por 10 dias. Mobilizar ABIN, PF e Receita para operação de inteligência integrada. Criar gabinete de crise em Manaus com governadores. Reservar opção militar para segunda fase.",
          estimatedCost: "Fiscal: R$ 180M · Político: baixo",
          projectedImpact:
            "Mapeia 60% das rotas de financiamento. Risco: facções percebem hesitação. Aprovação mantida no Norte.",
        },
      ],
    },
    {
      domain: "diplomacy",
      domainLabel: "Diplomacia & Comércio",
      options: [
        {
          id: "dip-a",
          code: "A",
          title: "Iniciativa Belém — Cúpula Sul-Americana de Comércio",
          description:
            "Convocar cúpula emergencial em Belém com 12 países sul-americanos para articulação de bloco comercial contra CBAM europeu. Apresentar contraproposta tarifária conjunta e agenda de biocombustíveis.",
          estimatedCost: "Fiscal: R$ 45M (logística) · Político: baixo · Diplomático: alto",
          projectedImpact:
            "Fortalece Mercosul. 70% de chance de criar pressão sobre UE. China pode aderir como observadora.",
        },
        {
          id: "dip-b",
          code: "B",
          title: "Encontro Privado com Macron — Canal Bilateral",
          description:
            "Convidar Macron para reunião reservada no Palácio do Planalto em 20/10. Propor moratória de 90 dias ao CBAM em troca de compromissos ambientais brasileiros reforçados (licenciamento, desmatamento).",
          estimatedCost: "Fiscal: R$ 8M · Político: baixo · Diplomático: médio",
          projectedImpact:
            "Margem realista: 55% de obter moratória. Risco: oposição pode pintar como concessão ambiental.",
        },
      ],
    },
    {
      domain: "economy",
      domainLabel: "Política Econômica",
      options: [
        {
          id: "eco-a",
          code: "A",
          title: "Aprovar Cadastro de Mega-Ricos + Alíquota Gradual",
          description:
            "Envíar ao Congresso pacote tributário com (i) cadastro obrigatório de beneficiários finais e (ii) IR sobre grandes fortunas com alíquota escalonada: 0,5% ano 1, 1% ano 2, 2% ano 3 sobre patrimônios acima de R$ 50M.",
          estimatedCost: "Fiscal: arrecada +R$ 14B/ano · Político: 3 senadores aliados em dúvida",
          projectedImpact:
            "Sinal fiscal positivo ao mercado. Reduz CDS em 15-20bps. Resistência forte CNI/Fiesp.",
        },
        {
          id: "eco-b",
          code: "B",
          title: "Aprovar Apenas Cadastro (Postergar Alíquota)",
          description:
            "Avançar apenas com o cadastro de beneficiários finais (consenso fácil). Remeter alíquota sobre grandes fortunas para audiências públicas em Q1 2027. Preservar capital político para votação do PL 4.471 agora.",
          estimatedCost: "Fiscal: arrecada +R$ 3,2B/ano (cadastro) · Político: baixo",
          projectedImpact:
            "Vitória parcial fácil. Preserva agenda legislativa. Crítica: esquerda acusará de recuo.",
        },
      ],
    },
  ],
  reservedArchive: [
    {
      codename: "Operação Espelho Surdo",
      status: "FASE 2 · ATIVA",
      details:
        "Vigilância eletrônica sobre 4 intermediários de cartel venezuelano. Escuta autorizada por STF ( prazo 45 dias).",
    },
    {
      codename: "Projeto Oráculo",
      status: "CONCLUIDO · CLASSIFICADO",
      details:
        "Modelo preditivo de fluxos migratórios e de drogas via aprendizado de máquina. 87% de acerto em projeção 30 dias.",
    },
    {
      codename: "Iniciativa Horizonte",
      status: "PAUSADO",
      details:
        "Canal reverso diplomático com Havana sobre migração caribenha. Pausado após incidente protocolar em 28/09.",
    },
    {
      codename: "Protocolo Tempestade",
      status: "STANDBY",
      details:
        "Plano de contingência para ruptura institucional em país vizinho. Acionável em 72h. Última revisão: 15/09/2026.",
    },
    {
      codename: "Operação Véu de Prata",
      status: "FASE 1 · ATIVA",
      details:
        "Infiltração agente duplo em célula de lavagem de criptomoedas. Ativo em Manaus. Janela de segurança: 30 dias.",
    },
  ],
  stateMetrics: {
    escalation: 2,
    popularity: 72,
    gdpGrowth: 2.3,
    inflation: 5.4,
    debtToGdp: 78.9,
    congressSupport: { senators: 62, deputies: 315 },
    militaryReadiness: { army: 84, navy: 75, airForce: 83 },
    exchangeRate: 5.12,
    deficit: 6.2,
  },
};
