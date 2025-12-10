-- Atualizar códigos dos tipos de documentos para formato NR
UPDATE document_types SET code = 'ASO' WHERE code = '2.2';
UPDATE document_types SET code = 'CNH' WHERE code = '2.4';
UPDATE document_types SET code = 'CTPS' WHERE code = '2.5';
UPDATE document_types SET code = 'FICHA_EPI' WHERE code = '2.3';
UPDATE document_types SET code = 'NR10' WHERE code = '3.0';
UPDATE document_types SET code = 'NR11' WHERE code = '3.1';
UPDATE document_types SET code = 'NR12' WHERE code = '3.2';
UPDATE document_types SET code = 'NR13' WHERE code = '3.3';
UPDATE document_types SET code = 'NR17' WHERE code = '3.4';
UPDATE document_types SET code = 'NR18' WHERE code = '3.5';
UPDATE document_types SET code = 'NR20' WHERE code = '3.6';
UPDATE document_types SET code = 'NR26' WHERE code = '4.0';
UPDATE document_types SET code = 'NR31' WHERE code = '3.7';
UPDATE document_types SET code = 'NR33' WHERE code = '3.8';
UPDATE document_types SET code = 'NR34' WHERE code = '2.9';
UPDATE document_types SET code = 'NR35' WHERE code = '3.9';
UPDATE document_types SET code = 'REG_TEC' WHERE code = '9.8';
UPDATE document_types SET code = 'TERMO_CONF' WHERE code = 'TERMO';

-- Adicionar tipos faltantes (RG, CPF, NR06, etc.)
INSERT INTO document_types (code, name, description, default_validity_years, is_active)
SELECT 'RG', 'Documento de Identidade (RG)', 'Registro Geral - Documento de Identidade', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE code = 'RG');

INSERT INTO document_types (code, name, description, default_validity_years, is_active)
SELECT 'CPF', 'Cadastro de Pessoa Física (CPF)', 'Cadastro de Pessoa Física', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE code = 'CPF');

INSERT INTO document_types (code, name, description, default_validity_years, is_active)
SELECT 'NR06', 'NR06 - Equipamentos de Proteção Individual', 'Treinamento de EPI conforme NR-06', 1, true
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE code = 'NR06');

INSERT INTO document_types (code, name, description, default_validity_years, is_active)
SELECT 'S2200', 'S2200 - Relatório eSocial', 'Relatório de Admissão eSocial', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE code = 'S2200');

INSERT INTO document_types (code, name, description, default_validity_years, is_active)
SELECT 'ORDEM_SERVICO', 'Ordem de Serviço', 'Ordem de Serviço do funcionário', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE code = 'ORDEM_SERVICO');

INSERT INTO document_types (code, name, description, default_validity_years, is_active)
SELECT 'CONTRATO', 'Contrato de Trabalho', 'Contrato de Trabalho do funcionário', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE code = 'CONTRATO');

INSERT INTO document_types (code, name, description, default_validity_years, is_active)
SELECT 'FICHA_REGISTRO', 'Ficha de Registro', 'Ficha de Registro de Funcionário', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE code = 'FICHA_REGISTRO');

INSERT INTO document_types (code, name, description, default_validity_years, is_active)
SELECT 'NR05', 'NR05 - CIPA', 'Comissão Interna de Prevenção de Acidentes', 1, true
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE code = 'NR05');

INSERT INTO document_types (code, name, description, default_validity_years, is_active)
SELECT 'NR23', 'NR23 - Proteção Contra Incêndios', 'Treinamento de combate a incêndio', 1, true
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE code = 'NR23');

INSERT INTO document_types (code, name, description, default_validity_years, is_active)
SELECT 'COMP_RESID', 'Comprovante de Residência', 'Comprovante de endereço residencial', NULL, true
WHERE NOT EXISTS (SELECT 1 FROM document_types WHERE code = 'COMP_RESID');