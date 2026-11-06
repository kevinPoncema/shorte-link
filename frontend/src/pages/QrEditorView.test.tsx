import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QrEditorView } from './QrEditorView';
import { api, LinkItem, User } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    createLink: vi.fn(),
    updateLink: vi.fn(),
  },
  API_BASE_URL: 'http://localhost:3000',
}));

describe('QrEditorView Component', () => {
  const mockUser: User = {
    id: 'user-1',
    email: 'test@kinetiqr.com',
    plan: 'STARTER',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders QR Studio editor, live preview and empty required fields without custom slug input', () => {
    render(
      <QrEditorView
        currentUser={mockUser}
        onSaved={vi.fn()}
        onAssignToNfc={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={vi.fn()}
      />
    );

    expect(screen.getByText(/STUDIO \/ EDITOR ACTIVO/i)).toBeInTheDocument();
    expect(screen.getByText(/Enrutado Dinámico/i)).toBeInTheDocument();
    expect(screen.getByText('Probar Escaneo')).toBeInTheDocument();
    expect(screen.getByText('SVG / 4K')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ej\. Menú Principal/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://ejemplo.com/tu-destino')).toBeInTheDocument();
    expect(screen.getByText('Obligatorio')).toBeInTheDocument();

    // Verifies that Slug Corto Personalizado does NOT appear and final destination link placeholder is shown
    expect(screen.queryByText(/Slug Corto Personalizado/i)).not.toBeInTheDocument();
    expect(screen.getByText('https://tu-destino-final.com')).toBeInTheDocument();
  });

  it('validates required name field before saving', async () => {
    const handleToast = vi.fn();

    render(
      <QrEditorView
        currentUser={mockUser}
        onSaved={vi.fn()}
        onAssignToNfc={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={handleToast}
      />
    );

    const saveBtn = screen.getByText('Guardar Dinámico');
    fireEvent.click(saveBtn);

    expect(handleToast).toHaveBeenCalledWith(
      expect.stringContaining('El Nombre de Referencia es obligatorio'),
      'error'
    );
    expect(api.createLink).not.toHaveBeenCalled();
  });

  it('saves dynamic link on submit button click when valid fields are provided', async () => {
    (api.createLink as any).mockResolvedValue({
      id: 'new-link-id',
      name: 'Carta de Vinos & Licores',
      shortCode: 'vinos2025',
      targetUrl: 'https://restaurantecentral.com/vinos-2025',
      isActive: true,
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const handleSaved = vi.fn();

    render(
      <QrEditorView
        currentUser={mockUser}
        onSaved={handleSaved}
        onAssignToNfc={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={vi.fn()}
      />
    );

    const nameInput = screen.getByPlaceholderText(/Ej\. Menú Principal/i);
    const urlInput = screen.getByPlaceholderText('https://ejemplo.com/tu-destino');

    fireEvent.change(nameInput, { target: { value: 'Carta de Vinos & Licores' } });
    fireEvent.change(urlInput, { target: { value: 'https://restaurantecentral.com/vinos-2025' } });

    // Under QR preview, target URL is shown dynamically
    expect(screen.getByText('https://restaurantecentral.com/vinos-2025')).toBeInTheDocument();

    const saveBtn = screen.getByText('Guardar Dinámico');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.createLink).toHaveBeenCalledWith({
        name: 'Carta de Vinos & Licores',
        targetUrl: 'https://restaurantecentral.com/vinos-2025',
      });
      expect(handleSaved).toHaveBeenCalled();
    });

    // Generated shortened link appears after creation
    expect(await screen.findByText('Enlace Acortado Generado')).toBeInTheDocument();
    expect(screen.getByText('kineti.qr/r/vinos2025')).toBeInTheDocument();
  });

  it('displays read-only generated short link when editing an existing link', () => {
    const existingLink: LinkItem = {
      id: 'link-1',
      name: 'Menú Digital',
      shortCode: 'menu123',
      targetUrl: 'https://restaurante.com/menu',
      isActive: true,
      userId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    render(
      <QrEditorView
        currentUser={mockUser}
        linkToEdit={existingLink}
        onSaved={vi.fn()}
        onAssignToNfc={vi.fn()}
        onOpenUpgradeModal={vi.fn()}
        onShowToast={vi.fn()}
      />
    );

    expect(screen.getByText('Enlace Acortado Generado')).toBeInTheDocument();
    expect(screen.getByText('kineti.qr/r/menu123')).toBeInTheDocument();
    expect(screen.getByText('https://restaurante.com/menu')).toBeInTheDocument();
    expect(screen.queryByText(/Slug Corto Personalizado/i)).not.toBeInTheDocument();
  });
});
