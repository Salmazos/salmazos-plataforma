export default function CurriculoMotivacional() {
  return (
    <div className="hidden md:block" style={{ alignSelf: "start", position: "sticky", top: "24px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/quem-anexa-curriculo.jpg"
        alt="Quem anexa o currículo sai na frente!"
        style={{ width: "100%", height: "auto", objectFit: "contain", display: "block" }}
      />
    </div>
  );
}
