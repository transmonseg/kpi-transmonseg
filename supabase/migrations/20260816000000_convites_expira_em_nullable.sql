-- Convites deixam de expirar por padrão: expira_em vira opcional. NULL =
-- nunca expira. Convites já existentes mantêm o prazo que já tinham —
-- não é retroativo.
alter table convites alter column expira_em drop default;
alter table convites alter column expira_em drop not null;
