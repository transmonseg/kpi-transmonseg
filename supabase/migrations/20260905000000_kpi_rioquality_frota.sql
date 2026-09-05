-- kpi_rioquality_frota: placa -> cv (codigo de veiculo na Unitrac) da Rio Quality.
--
-- Achado real 05/09: a API aberta da Unitrac (datalayer) so' lista a frota por
-- COD_USER (`/veiculos/masn/{cod}`), e o cod_user da conta Rio Quality nao foi
-- descoberto (so' o emprecodigo=598, que esse endpoint nao aceita). Os CVs
-- abaixo foram coletados na tela Monitoramento > Veiculos do portal (login da
-- Erica, filtro EMPRESA = RIO QUALITY) -- 59 dos ~102 veiculos. Placa sem CV
-- aqui sai no KPI como "sem rastreador" ate' completarmos a lista (ou
-- descobrirmos o cod_user, quando esta tabela vira so' cache).
--
-- Aplicar no Postgres self-hosted do KPI (kpi_transmonseg), como as demais:
--   sudo -u postgres psql -d kpi_transmonseg -f <arquivo>

-- Libera a empresa 'rioquality' pra todo admin atual (o layout
-- /painel/rioquality exige papel admin + empresa liberada no perfil).
update perfis
   set empresas = array_append(empresas, 'rioquality')
 where papel = 'admin'
   and not ('rioquality' = any(coalesce(empresas, '{}')));

create table if not exists kpi_rioquality_frota (
  placa_norm text primary key,
  cv text not null,
  nome text,
  atualizado_em timestamptz not null default now()
);
alter table kpi_rioquality_frota enable row level security;
-- sem policy pra authenticated: so' o service role le/escreve (mesmo padrao
-- de kpi_romaneio_geracoes / kpi_romaneio_geocode_cache).

insert into kpi_rioquality_frota (placa_norm, cv, nome) values
  ('BKF6I55', '15178', 'CORAGEM'),
  ('KZP9H17', '15281', 'GROOT'),
  ('RJC2D24', '15284', 'MAMUTE'),
  ('TTT1J28', '18962', 'FELIZ'),
  ('KQZ7F71', '15252', 'PEPE LEGAL'),
  ('RKU5A27', '15283', 'SID'),
  ('LTZ7I72', '15221', 'SHAZAN'),
  ('LUI1G55', '15228', 'CHUPETINHA'),
  ('LMI8893', '15265', 'TOCHA'),
  ('RIQ3G66', '15272', 'ROCKET ICE'),
  ('LJI4I52', '15186', 'AZULAO'),
  ('KWY8H35', '19587', 'CHICO BENTO'),
  ('KZO9D72', '15275', 'PANTERA'),
  ('LRT6H89', '4306', 'GLADIADOR'),
  ('PUT3E37', '19586', 'DOCINHO'),
  ('RKQ5B46', '15267', 'CUCA'),
  ('SRO9A31', '16975', 'GARRINCHA'),
  ('JIE8C41', '16057', 'BIRICUTICO'),
  ('TUP1J16', '18957', 'GALO DOIDO'),
  ('KQR6445', '4134', 'MAGNETO'),
  ('RUT6A52', '19590', 'SENNA'),
  ('LNH9C11', '15280', 'POLAR'),
  ('LUN8I82', '15274', 'FROZEN'),
  ('SQY3C65', '16569', 'TUROLLA'),
  ('LTQ7I89', '15240', 'LIGEIRINHO'),
  ('RKO2F17', '15266', 'MUTLEY'),
  ('LTT9C55', '15293', 'POPEYE'),
  ('SRE7B39', '16974', 'R. DINAMITE'),
  ('LLO2E52', '15220', 'CANARINHO'),
  ('LMF5C14', '22345', 'VAPT VUPT'),
  ('KVK2951', '2708', 'CAP. AMERICA'),
  ('LQC3192', '12730', 'RILDO'),
  ('RIU1I75', '19593', 'OLIVEIRA'),
  ('KSL7F14', '15243', 'ABENÇOADO'),
  ('SRL9A58', '16979', 'PELÉ'),
  ('RJR2J95', '15249', 'PICOLE'),
  ('RKR5J02', '15278', 'SACI'),
  ('RJW1I16', '15210', 'SONIC'),
  ('LTS5D49', '15181', 'FUMACA'),
  ('KND2D45', '15224', 'DEXTER'),
  ('LUC1D78', '15205', 'PINGUIM'),
  ('LPH6E20', '15202', 'COYOTE'),
  ('LUJ7G13', '15209', 'FRAJOLA'),
  ('KZU1D63', '15254', 'PETER PAN'),
  ('RKF2B79', '15241', 'PAPA LEGUAS'),
  ('LCD9A39', '15207', 'TERMINATOR'),
  ('LTQ5H02', '15250', 'ACQUAMAN'),
  ('LHI9D08', '19567', 'FRANKENSTEIN'),
  ('RJL4D87', '15255', 'GASPARZINHO'),
  ('LUN8C28', '15276', 'CORINGA'),
  ('LQM9692', '2702', 'ALIBABA'),
  ('LTU8I56', '15271', 'EVEREST'),
  ('LMU5I05', '15222', 'WOLVERINE'),
  ('KWM9877', '4157', 'ATOM'),
  ('RIQ4D90', '15244', 'BLAU BLAU'),
  ('KVU6307', '2718', 'FERA'),
  ('KYC5F36', '15208', 'BUSCAPE'),
  ('LMV8B05', '15177', 'CHAPOLIN'),
  ('RKE4H10', '15184', 'CAPELETI')
on conflict (placa_norm) do update set cv = excluded.cv, nome = excluded.nome, atualizado_em = now();
