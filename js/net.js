/**
 * Комнаты, invite-ссылки и Realtime-синхронизация состояния.
 * Depends on: auth.js, game.js, config.js
 */
(function () {
  const { PLAYER_COLORS, START_MONEY, serializeGameState, hydrateGameState, createGame } =
    window.Game;

  let realtimeChannel = null;

  function sb() {
    return window.JMAuth.getClient();
  }

  function makeRoomCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return code;
  }

  function inviteUrl(code) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', code);
    return url.toString();
  }

  function parseRoomCodeFromUrl() {
    return new URLSearchParams(window.location.search).get('room');
  }

  async function createRoom(hostUser, hostProfile) {
    const client = sb();
    if (!client) throw new Error('Онлайн не настроен');

    const code = makeRoomCode();
    const { data: room, error } = await client
      .from('rooms')
      .insert({
        code,
        host_id: hostUser.id,
        status: 'lobby',
        location_id: 'malta',
      })
      .select()
      .single();
    if (error) throw error;

    const { error: joinErr } = await client.from('room_players').insert({
      room_id: room.id,
      user_id: hostUser.id,
      seat: 0,
      display_name: hostProfile?.display_name || hostUser.email,
      avatar_color: hostProfile?.avatar_color || PLAYER_COLORS[0],
    });
    if (joinErr) throw joinErr;

    return room;
  }

  async function getRoomByCode(code) {
    const client = sb();
    const { data, error } = await client
      .from('rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function listRoomPlayers(roomId) {
    const client = sb();
    const { data, error } = await client
      .from('room_players')
      .select('*')
      .eq('room_id', roomId)
      .order('seat', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async function joinRoom(code, user, profile) {
    const client = sb();
    if (!client) throw new Error('Онлайн не настроен');

    const room = await getRoomByCode(code);
    if (!room) throw new Error('Комната не найдена');
    if (room.status === 'finished') throw new Error('Игра в комнате уже завершена');

    const players = await listRoomPlayers(room.id);
    const existing = players.find((p) => p.user_id === user.id);
    if (existing) return { room, players };

    if (room.status === 'playing') {
      throw new Error('Игра уже началась. Попросите хоста создать новую комнату.');
    }

    const max = window.AppConfig.MAX_ROOM_PLAYERS || 4;
    if (players.length >= max) throw new Error('Комната заполнена');

    const usedSeats = new Set(players.map((p) => p.seat));
    let seat = 0;
    while (usedSeats.has(seat)) seat += 1;

    const { error } = await client.from('room_players').insert({
      room_id: room.id,
      user_id: user.id,
      seat,
      display_name: profile?.display_name || user.email,
      avatar_color: profile?.avatar_color || PLAYER_COLORS[seat % PLAYER_COLORS.length],
    });
    if (error) throw error;

    const updated = await listRoomPlayers(room.id);
    return { room, players: updated };
  }

  /** Удалить себя из комнаты (способ A — выход по коду/лобби). */
  async function leaveRoom(roomId, userId) {
    const client = sb();
    if (!client || !roomId || !userId) return;
    const { error } = await client
      .from('room_players')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', userId);
    if (error) throw error;
  }

  function playersFromRoomSeats(roomPlayers) {
    return roomPlayers.map((rp, i) => ({
      id: i,
      userId: rp.user_id,
      name: rp.display_name || `Игрок ${i + 1}`,
      color: rp.avatar_color || PLAYER_COLORS[i % PLAYER_COLORS.length],
      money: START_MONEY,
      position: 0,
      inJail: false,
      eventShield: false,
    }));
  }

  async function startGame(room, roomPlayers, locations) {
    const client = sb();
    const location =
      locations.find((l) => l.id === room.location_id) || locations[0];
    const players = playersFromRoomSeats(roomPlayers);
    const game = createGame(location, {
      players,
      online: true,
      roomId: room.id,
      roomCode: room.code,
      locations,
    });
    const state = serializeGameState(game);

    const { data: gameRow, error } = await client
      .from('games')
      .upsert(
        {
          room_id: room.id,
          state,
          updated_at: new Date().toISOString(),
          updated_by: room.host_id,
        },
        { onConflict: 'room_id' }
      )
      .select()
      .single();
    if (error) throw error;

    const { error: roomErr } = await client
      .from('rooms')
      .update({ status: 'playing', location_id: location.id })
      .eq('id', room.id);
    if (roomErr) throw roomErr;

    return { game, gameRow };
  }

  async function pushGameState(roomId, game, userId) {
    const client = sb();
    if (!client || !roomId) return;
    const state = serializeGameState(game);
    const { error } = await client
      .from('games')
      .update({
        state,
        updated_at: new Date().toISOString(),
        updated_by: userId || null,
      })
      .eq('room_id', roomId);
    if (error) throw error;
    return state;
  }

  async function fetchGameState(roomId, locations) {
    const client = sb();
    const { data, error } = await client
      .from('games')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.state) return null;
    const game = hydrateGameState(data.state, locations);
    if (game) {
      game.online = true;
      game.roomId = roomId;
      game.roomCode = data.state.roomCode || game.roomCode;
    }
    return game;
  }

  function subscribeGame(roomId, onUpdate) {
    const client = sb();
    if (!client) return () => {};

    unsubscribeGame();
    realtimeChannel = client
      .channel(`game:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          onUpdate(payload.new || payload.old);
        }
      )
      .subscribe();

    return unsubscribeGame;
  }

  function unsubscribeGame() {
    const client = sb();
    if (client && realtimeChannel) {
      client.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  function subscribeLobby(roomId, onPlayersChange) {
    const client = sb();
    if (!client) return () => {};
    const channel = client
      .channel(`lobby:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_players',
          filter: `room_id=eq.${roomId}`,
        },
        async () => {
          const players = await listRoomPlayers(roomId);
          onPlayersChange(players);
        }
      )
      .subscribe();

    return () => client.removeChannel(channel);
  }

  window.JMNet = {
    makeRoomCode,
    inviteUrl,
    parseRoomCodeFromUrl,
    createRoom,
    getRoomByCode,
    listRoomPlayers,
    joinRoom,
    leaveRoom,
    playersFromRoomSeats,
    startGame,
    pushGameState,
    fetchGameState,
    subscribeGame,
    unsubscribeGame,
    subscribeLobby,
  };
})();
