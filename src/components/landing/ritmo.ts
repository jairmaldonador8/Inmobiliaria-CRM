/**
 * Pulso compartido de las animaciones de la landing.
 *
 * La gráfica de «Lo que no se mide» tarda 2 550 ms en una pasada y los
 * íconos de «Cómo funciona» 2 770 ms (la escalera es la más larga). Con un
 * ciclo común de 5 550 ms las dos descansan alrededor de tres segundos y
 * vuelven a empezar con el mismo compás: aunque nunca coinciden en pantalla,
 * la página entera se siente respirando a un solo ritmo.
 */
export const CICLO_MS = 5550
